import { IDexHelper } from '../../dex-helper';
import { Fetcher, SkippingRequest } from '../../lib/fetcher/fetcher';
import { validateAndCast } from '../../lib/validators';
import { Logger, Address, Token } from '../../types';
import { Network } from '../../constants';
import { ethers } from 'ethers';
import {
  TokensResponse,
  PairsResponse,
  BlackListResponse,
  PricesResponse,
  RFQConfig,
  TokenWithInfo,
  PairMap,
  FirmReturnObject,
  RFQSecret,
} from './types';
import {
  blacklistResponseValidator,
  firmRateResponseValidator,
  pairsResponseValidator,
  pricesResponse,
  tokensResponseValidator,
} from './validators';
import { SwapSide } from '@paraswap/core';
import { DEXALOT_API_URL } from './constants';
import axios from 'axios';
import { Headers } from 'cross-fetch';
import {
  createERC1271Contract,
  ERC1271Contract,
} from '../../lib/erc1271-utils';
import { isContractAddress } from '../../utils';
import { RequestConfig } from '../../dex-helper/irequest-wrapper';
import { genericRFQAuthHttp } from '../generic-rfq/security';

export class RateFetcher {
  private tokensFetcher: Fetcher<TokensResponse>;
  private pairsFetcher: Fetcher<PairsResponse>;
  private rateFetcher: Fetcher<PricesResponse>;
  private blackListFetcher?: Fetcher<BlackListResponse>;

  private tokens: Record<string, TokenWithInfo> = {};
  public addressToTokenMap: Record<string, TokenWithInfo> = {};
  private pairs: PairMap = {};

  public blackListCacheKey: string;

  private verifierContract?: ERC1271Contract;

  private authHttp: (
    secret: RFQSecret,
  ) => (options: RequestConfig) => RequestConfig;

  constructor(
    private dexHelper: IDexHelper,
    private config: RFQConfig,
    private dexKey: string,
    private logger: Logger,
  ) {
    this.authHttp = genericRFQAuthHttp(config.pathToRemove);
    this.tokensFetcher = new Fetcher<TokensResponse>(
      dexHelper.httpRequest,
      {
        info: {
          requestOptions: config.tokensConfig.reqParams,
          caster: (data: unknown) => {
            return validateAndCast<TokensResponse>(
              data,
              tokensResponseValidator,
            );
          },
          authenticate: this.authHttp(config.tokensConfig.secret),
        },
        handler: this.handleTokensResponse.bind(this),
      },
      config.tokensConfig.intervalMs,
      this.logger,
    );

    this.pairsFetcher = new Fetcher<PairsResponse>(
      dexHelper.httpRequest,
      {
        info: {
          requestOptions: config.pairsConfig.reqParams,
          caster: (data: unknown) => {
            return validateAndCast<PairsResponse>(data, pairsResponseValidator);
          },
          authenticate: this.authHttp(config.pairsConfig.secret),
        },
        handler: this.handlePairsResponse.bind(this),
      },
      config.pairsConfig.intervalMs,
      this.logger,
    );

    this.rateFetcher = new Fetcher<PricesResponse>(
      dexHelper.httpRequest,
      {
        info: {
          requestOptions: config.rateConfig.reqParams,
          caster: (data: unknown) => {
            return validateAndCast<PricesResponse>(data, pricesResponse);
          },
          authenticate: this.authHttp(config.rateConfig.secret),
        },
        handler: this.handlePricesResponse.bind(this),
      },
      config.rateConfig.intervalMs,
      logger,
    );

    if (config.blacklistConfig) {
      this.blackListFetcher = new Fetcher<BlackListResponse>(
        dexHelper.httpRequest,
        {
          info: {
            requestOptions: config.blacklistConfig.reqParams,
            caster: (data: unknown) => {
              return validateAndCast<BlackListResponse>(
                data,
                blacklistResponseValidator,
              );
            },
            authenticate: this.authHttp(config.rateConfig.secret),
          },
          handler: this.handleBlackListResponse.bind(this),
        },
        config.blacklistConfig.intervalMs,
        logger,
      );
    }

    this.blackListCacheKey = `${this.dexHelper.config.data.network}_${this.dexKey}_blacklist`;
  }

  private handleTokensResponse(data: TokensResponse) {
    this.logger.info(`GETS HERE`);
    for (const tokenName of Object.keys(data.tokens)) {
      const token = data.tokens[tokenName];
      token.address = token.address.toLowerCase();
      this.tokens[tokenName] = token;
    }

    this.addressToTokenMap = Object.keys(this.tokens).reduce((acc, key) => {
      const obj = this.tokens[key];
      if (!obj) {
        return acc;
      }
      acc[obj.address.toLowerCase()] = obj;
      return acc;
    }, {} as Record<string, TokenWithInfo>);
  }

  private handlePairsResponse(resp: PairsResponse) {
    this.logger.info(`PAIRS RESP:
      ${resp}   
    `);
    this.pairs = {};

    if (this.rateFetcher.isPolling()) {
      this.rateFetcher.stopPolling();
    }

    const pairs: PairMap = {};
    for (const pairName of Object.keys(resp.pairs)) {
      pairs[pairName] = resp.pairs[pairName];
    }

    this.pairs = pairs;
    this.rateFetcher.startPolling();
  }

  private async handlePricesResponse(resp: PricesResponse) {
    const pairs = this.pairs;
    await Promise.all(
      Object.keys(resp.prices).map(async pairName => {
        const pair = pairs[pairName];
        if (!pair) {
          return;
        }
        const prices = resp.prices[pairName];

        if (!prices.asks || !prices.bids) {
          return;
        }

        const baseToken = this.tokens[pair.base];
        const quoteToken = this.tokens[pair.quote];

        if (!baseToken || !quoteToken) {
          this.logger.warn(`missing base or quote token`);
          return;
        }

        if (prices.bids.length) {
          await this.dexHelper.cache.setex(
            this.dexKey,
            this.dexHelper.config.data.network,
            `${baseToken.address}_${quoteToken.address}_bids`,
            this.config.rateConfig.dataTTLS,
            JSON.stringify(prices.bids),
          );
        }

        if (prices.asks.length) {
          await this.dexHelper.cache.setex(
            this.dexKey,
            this.dexHelper.config.data.network,
            `${baseToken.address}_${quoteToken.address}_asks`,
            this.config.rateConfig.dataTTLS,
            JSON.stringify(prices.asks),
          );
        }
      }),
    );
  }

  private async handleBlackListResponse(resp: BlackListResponse) {
    await this.dexHelper.cache.setex(
      this.dexKey,
      this.dexHelper.config.data.network,
      this.blackListCacheKey,
      this.config.rateConfig.dataTTLS,
      JSON.stringify(resp.blacklist),
    );
  }

  async initialize() {
    const isContract = await isContractAddress(
      this.dexHelper.web3Provider,
      this.config.maker,
    );
    if (isContract) {
      this.verifierContract = createERC1271Contract(
        this.dexHelper.web3Provider,
        this.config.maker,
      );
    }
  }

  async start() {
    this.tokensFetcher.startPolling();
    this.pairsFetcher.startPolling();
    if (this.blackListFetcher) {
      this.blackListFetcher.startPolling();
    }
  }
  async stop() {
    this.tokensFetcher.stopPolling();
    this.pairsFetcher.stopPolling();
    this.rateFetcher.stopPolling();

    if (this.blackListFetcher) {
      this.blackListFetcher.stopPolling();
    }
  }

  async getTokens(): Promise<Record<string, TokenWithInfo>> {
    return this.tokens;
  }

  async getPairs(): Promise<PairMap> {
    return this.pairs;
  }

  async getTokensByAddress(): Promise<Record<string, TokenWithInfo>> {
    return this.addressToTokenMap;
  }

  async getOrderbook(pair: string, book: string): Promise<string[][]> {
    const [base, quote] = pair.split('/');

    const baseAddress = this.tokens[base].address;
    const quoteAdress = this.tokens[quote].address;
    if (book == 'bids') {
      const bidsStr = await this.dexHelper.cache.get(
        this.dexKey,
        this.dexHelper.config.data.network,
        `${baseAddress}_${quoteAdress}_bids`,
      );
      if (typeof bidsStr == 'string') {
        const bids: string[][] = JSON.parse(bidsStr);
        return bids;
      }
      return [];
    }

    const asksStr = await this.dexHelper.cache.get(
      this.dexKey,
      this.dexHelper.config.data.network,
      `${baseAddress}_${quoteAdress}_asks`,
    );
    if (typeof asksStr == 'string') {
      const asks: string[][] = JSON.parse(asksStr);
      return asks;
    }
    return [];
  }

  async getFirmRate(
    _srcToken: Token,
    _destToken: Token,
    srcAmount: string,
    side: SwapSide,
    userAddress: Address,
  ): Promise<FirmReturnObject> {
    if (side == SwapSide.SELL) {
      const resp = await axios.post(`${DEXALOT_API_URL}/api/rfq/firm`, {
        makerAsset: ethers.utils.getAddress(_destToken.address),
        takerAsset: ethers.utils.getAddress(_srcToken.address),
        takerAmount: srcAmount,
        userAddress: userAddress,
      });
      return resp.data;
    }

    const resp = await axios.post(`${DEXALOT_API_URL}/api/rfq/firm`, {
      makerAsset: ethers.utils.getAddress(_srcToken.address),
      takerAsset: ethers.utils.getAddress(_destToken.address),
      makerAmount: srcAmount,
      userAddress: userAddress,
    });
    return resp.data;
  }
}
