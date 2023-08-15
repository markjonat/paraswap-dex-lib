import BigNumber from 'bignumber.js';
import { BN_0, BN_1, getBigNumberPow } from '../../bignumber-constants';
import { AsyncOrSync } from 'ts-essentials';
import {
  Token,
  Address,
  ExchangePrices,
  PoolPrices,
  AdapterExchangeParam,
  SimpleExchangeParam,
  PoolLiquidity,
  Logger,
  ExchangeTxInfo,
  OptimalSwapExchange,
  PreprocessTransactionOptions,
} from '../../types';
import { SwapSide, Network, ContractMethod } from '../../constants';
import * as CALLDATA_GAS_COST from '../../calldata-gas-cost';
import { getDexKeysWithNetwork } from '../../utils';
import { IDex } from '../../dex/idex';
import { IDexHelper } from '../../dex-helper/idex-helper';
import { DexalotData, PricesResponse } from './types';
import { SimpleExchange } from '../simple-exchange';
import { DexalotConfig, Adapters } from './config';
import { RateFetcher } from './rate-fetcher';
import { DEXALOT_API_URL } from './constants';
import { PairTypes } from '../balancer-v2/LinearPool';
import { TokenData } from './types';
import { ethers } from 'ethers';
import { FirmReturnObject } from './types';

export class Dexalot extends SimpleExchange implements IDex<DexalotData> {
  readonly hasConstantPriceLargeAmounts = false;
  // TODO: set true here if protocols works only with wrapped asset
  readonly needWrapNative = false;

  readonly isFeeOnTransferSupported = false;

  public static dexKeysWithNetwork: { key: string; networks: Network[] }[] =
    getDexKeysWithNetwork(DexalotConfig);

  logger: Logger;
  private rateFetcher: RateFetcher;

  constructor(
    readonly network: Network,
    readonly dexKey: string,
    readonly dexHelper: IDexHelper,
    protected adapters = Adapters[network] || {}, // TODO: add any additional optional params to support other fork DEXes
  ) {
    super(dexHelper, dexKey);
    this.logger = dexHelper.getLogger(dexKey);

    this.rateFetcher = new RateFetcher(
      this.dexHelper,
      {
        tokensConfig: {
          reqParams: {
            url: `${DEXALOT_API_URL}/api/rfq/tokens`,
            method: 'GET',
          },
          secret: {
            domain: '',
            accessKey: '',
            secretKey: '',
          },
          intervalMs: 10000,
          dataTTLS: 10000,
        },
        pairsConfig: {
          reqParams: {
            url: `${DEXALOT_API_URL}/api/rfq/pairs`,
            method: 'GET',
          },
          secret: {
            domain: '',
            accessKey: '',
            secretKey: '',
          },
          intervalMs: 10000,
          dataTTLS: 10000,
        },
        rateConfig: {
          reqParams: {
            url: `${DEXALOT_API_URL}/api/rfq/prices`,
            method: 'GET',
          },
          secret: {
            domain: '',
            accessKey: '',
            secretKey: '',
          },
          intervalMs: 10000,
          dataTTLS: 10000,
        },
        firmRateConfig: {
          url: `${DEXALOT_API_URL}/api/rfq/firm`,
          method: 'POST',
          // params: {
          //   string,
          //   string,
          //   string,
          //   string,
          //   string,
          // },
          secret: {
            domain: '',
            accessKey: '',
            secretKey: '',
          },
        },
        blacklistConfig: {
          reqParams: {
            url: `${DEXALOT_API_URL}/api/rfq/blacklist`,
            method: 'GET',
          },
          secret: {
            domain: '',
            accessKey: '',
            secretKey: '',
          },
          intervalMs: 10000,
          dataTTLS: 10000,
        },
        maker: '0xe84D0CfE6ca3281822050AaCa31578e5205204Dd',
      },
      this.dexKey,
      this.logger,
    );
  }

  // Initialize pricing is called once in the start of
  // pricing service. It is intended to setup the integration
  // for pricing requests. It is optional for a DEX to
  // implement this function
  async initializePricing(blockNumber: number): Promise<void> {
    // TODO: complete me!
    // api.prices()
    await this.rateFetcher.initialize();
    this.logger.info('PRICING INITIALIZED');
    if (!this.dexHelper.config.isSlave) {
      await this.rateFetcher.start();
    }
    return;
  }

  async stop() {
    await this.rateFetcher.stop();
  }

  // Returns the list of contract adapters (name and index)
  // for a buy/sell. Return null if there are no adapters.
  getAdapters(side: SwapSide): { name: string; index: number }[] | null {
    return this.adapters[side] ? this.adapters[side] : null;
  }

  // Returns list of pool identifiers that can be used
  // for a given swap. poolIdentifiers must be unique
  // across DEXes. It is recommended to use
  // ${dexKey}_${poolAddress} as a poolIdentifier
  async getPoolIdentifiers(
    srcToken: Token,
    destToken: Token,
    side: SwapSide,
    blockNumber: number,
  ): Promise<string[]> {
    // TODO: complete me!
    // no pools
    // added
    // maybe verify src is base?
    return [
      `${this.dexKey}_${srcToken.address}_${destToken.address}`.toLowerCase(),
    ];
  }

  // need to find quote decimals
  // pass quote decimals
  // format output based off quote - base or vice versa

  private calcOutputs(
    orderBook: string[][],
    amounts: number[],
    quoteDecimals: number,
    baseDecimals: number,
    outDecimals: number,
    isBidBook: boolean,
  ) {
    let outputs = [];
    for (const amount of amounts) {
      if (amount == 0) {
        outputs.push(new BigNumber(0));
        continue;
      }
      let unfilled: number = amount;
      let prices: number = 0;
      let qtys: number = 0;
      for (const order of orderBook) {
        const price: number = Number(order[0]);
        const qty: number = Number(order[1]);
        if (unfilled - qty >= 0) {
          unfilled -= qty;
          prices += price * qty;
          qtys += qty;
          continue;
        }
        qtys += unfilled;
        prices += price * unfilled;
        unfilled = 0;
        break;
      }

      if (unfilled > 0) {
        outputs.push(new BigNumber(0)); // TODO: verify correct output
        continue;
      }

      // const avgPrice = prices / qtys;
      let avgPrice = 0;

      if (isBidBook) {
        avgPrice = prices / qtys;
      } else {
        avgPrice = qtys / prices;
      }
      outputs.push(new BigNumber(avgPrice * amount));
    }

    const r = outputs.map(o =>
      BigInt(o.multipliedBy(10 ** outDecimals).toFixed(0)),
    );
    return r;
  }

  // Returns pool prices for amounts.
  // If limitPools is defined only pools in limitPools
  // should be used. If limitPools is undefined then
  // any pools can be used.
  async getPricesVolume(
    srcToken: Token,
    destToken: Token,
    amounts: bigint[],
    side: SwapSide,
    blockNumber: number,
    limitPools?: string[],
  ): Promise<null | ExchangePrices<DexalotData>> {
    // TODO: complete me!
    // call firm, return amount
    const pairs = await this.rateFetcher.getPairs();
    const tokens = await this.rateFetcher.getTokensByAddress();

    // change address to dev address
    const srcSymbol = tokens[srcToken.address.toLowerCase()].symbol;
    const destSymbol = tokens[destToken.address.toLowerCase()].symbol;
    let isSrcBase: boolean = false;
    let pair: string = '';
    let quoteDecimals: number = 0;
    let baseDecimals: number = 0;
    for (const pairName of Object.keys(pairs)) {
      if (`${srcSymbol}/${destSymbol}` == pairName) {
        isSrcBase = true;
        pair = `${srcSymbol}/${destSymbol}`;
        quoteDecimals = destToken.decimals;
        baseDecimals = srcToken.decimals;
        break;
      }
      if (`${destSymbol}/${srcSymbol}` == pairName) {
        pair = `${destSymbol}/${srcSymbol}`;
        quoteDecimals = srcToken.decimals;
        baseDecimals = destToken.decimals;
        break;
      }
    }

    // TODO: check if trade through two order books satisfies this
    if (limitPools) {
      if (
        !limitPools.includes(
          `${this.dexKey}_${srcToken.address}_${destToken.address}`.toLowerCase(),
        ) &&
        !limitPools.includes(
          `${destToken.address}_${srcToken.address}`.toLowerCase(),
        )
      ) {
        return null;
      }
    }

    let book = 'asks';
    if (
      (side == SwapSide.SELL && isSrcBase) ||
      (side == SwapSide.BUY && !isSrcBase)
    ) {
      book = 'bids';
    }

    const orderBook: string[][] = await this.rateFetcher.getOrderbook(
      pair,
      book,
    );

    if (orderBook.length == 0) {
      return null;
    }

    const inDecimals =
      side === SwapSide.SELL ? srcToken.decimals : destToken.decimals;
    const outDecimals =
      side === SwapSide.SELL ? destToken.decimals : srcToken.decimals;

    // let quoteDecimals =
    //   isSrcBase == true ?  destToken.decimals : srcToken.decimals;

    // const outDecimals = destToken.decimals;
    //quoteDecimals == destToken.decimals ? 0 : quoteDecimals - destToken.decimals;

    const _amountsInFormatted = amounts.map(a =>
      Number(ethers.utils.formatUnits(a, inDecimals)),
    );

    // turn amounts out in function
    // amounts => bignumber
    // format deciamls

    const isBidBook = book == 'bids' ? true : false;

    const outputs = this.calcOutputs(
      orderBook,
      _amountsInFormatted,
      quoteDecimals,
      baseDecimals,
      outDecimals,
      isBidBook,
    );

    this.logger.info(outputs);

    const dexalotData: DexalotData = {
      makerAddress: destToken.address,
      takerAddress: srcToken.address,
    };
    // TODO: input correct values
    return [
      {
        prices: outputs,
        unit: BigInt(outDecimals),
        data: dexalotData,
        poolIdentifier: pair,
        exchange: this.dexKey,
        gasCost: 100000,
        // gasCostL2?: number | number[];
        poolAddresses: ['0x00'],
      },
    ];
  }

  // Returns estimated gas cost of calldata for this DEX in multiSwap
  getCalldataGasCost(poolPrices: PoolPrices<DexalotData>): number | number[] {
    // TODO: update if there is any payload in getAdapterParam
    // copy from hh estimates?
    return CALLDATA_GAS_COST.DEX_NO_PAYLOAD;
  }

  // Encode params required by the exchange adapter
  // Used for multiSwap, buy & megaSwap
  // Hint: abiCoder.encodeParameter() could be useful
  getAdapterParam(
    srcToken: string,
    destToken: string,
    srcAmount: string,
    destAmount: string,
    data: DexalotData,
    side: SwapSide,
  ): AdapterExchangeParam {
    // TODO: complete me!
    // not used
    const { makerAddress } = data;

    // Encode here the payload for adapter
    const payload = '';

    return {
      targetExchange: makerAddress,
      payload,
      networkFee: '0',
    };
  }

  // Encode call data used by simpleSwap like routers
  // Used for simpleSwap & simpleBuy
  // Hint: this.buildSimpleParamWithoutWETHConversion
  // could be useful
  async getSimpleParam(
    srcToken: string,
    destToken: string,
    srcAmount: string,
    destAmount: string,
    data: DexalotData,
    side: SwapSide,
  ): Promise<SimpleExchangeParam> {
    // TODO: complete me!
    // format params for swap
    const { makerAddress } = data;

    // Encode here the transaction arguments
    const swapData = '';

    return this.buildSimpleParamWithoutWETHConversion(
      srcToken,
      srcAmount,
      destToken,
      destAmount,
      swapData,
      makerAddress,
    );
  }

  // This is called once before getTopPoolsForToken is
  // called for multiple tokens. This can be helpful to
  // update common state required for calculating
  // getTopPoolsForToken. It is optional for a DEX
  // to implement this
  async updatePoolState(): Promise<void> {
    // TODO: complete me!
    // websocket?
  }

  // Returns list of top pools based on liquidity. Max
  // limit number pools should be returned.
  async getTopPoolsForToken(
    tokenAddress: Address,
    limit: number,
  ): Promise<PoolLiquidity[]> {
    //TODO: complete me!
    // dont use pools, return just the pair?
    // itterate and find top trading pairs

    const tokens = await this.rateFetcher.getTokens();

    let symbol = '';

    for (const tokenName of Object.keys(tokens)) {
      const token = tokens[tokenName];
      if (token.address == tokenAddress.toLowerCase()) {
        symbol = token.symbol ? token.symbol : '';
        break;
      }
    }

    const pairs = await this.rateFetcher.getPairs();

    let pairsByLiquidity = [];
    for (const pairName of Object.keys(pairs)) {
      if (pairName.includes(symbol)) {
        const tokensInPair = pairName.split('/');
        const pairData: PoolLiquidity = {
          exchange: this.dexKey,
          address: '', // add rfq address
          connectorTokens: [tokens[tokensInPair[0]], tokens[tokensInPair[1]]],
          liquidityUSD: pairs[pairName].liquidityUSD,
        };
        pairsByLiquidity.push(pairData);
      }
    }
    pairsByLiquidity.sort(
      (a: PoolLiquidity, b: PoolLiquidity) => b.liquidityUSD - a.liquidityUSD,
    );
    return pairsByLiquidity.slice(0, limit);
  }

  async getFirmRate(
    _srcToken: Token,
    _destToken: Token,
    srcAmount: string,
    side: SwapSide,
    userAddress: Address,
  ): Promise<FirmReturnObject> {
    return await this.rateFetcher.getFirmRate(
      _srcToken,
      _destToken,
      srcAmount,
      side,
      userAddress,
    );
  }

  async preProcessTransaction(
    optimalSwapExchange: OptimalSwapExchange<DexalotData>,
    srcToken: Token,
    destToken: Token,
    side: SwapSide,
    options: PreprocessTransactionOptions,
  ): Promise<[OptimalSwapExchange<DexalotData>, ExchangeTxInfo]> {
    // if (await this.isBlacklisted(options.txOrigin)) {
    //   this.logger.warn(
    //     `${this.dexKey}-${this.network}: blacklisted TX Origin address '${options.txOrigin}' trying to build a transaction. Bailing...`,
    //   );
    //   throw new Error(
    //     `${this.dexKey}-${
    //       this.network
    //     }: user=${options.txOrigin.toLowerCase()} is blacklisted`,
    //   );
    // }
    // const mm = optimalSwapExchange.data?.mm;
    // assert(
    //   mm !== undefined,
    //   `${this.dexKey}-${this.network}: MM was not provided in data`,
    // );
    // const chainId = this.network as ChainId;

    // const normalizedSrcToken = this.normalizeToken(srcToken);
    // const normalizedDestToken = this.normalizeToken(destToken);

    // let rfq: RfqResponse;
    // try {
    //   rfq = await this.api.requestQuote({
    //     chainId,
    //     baseToken: normalizedSrcToken.address,
    //     quoteToken: normalizedDestToken.address,
    //     ...(side === SwapSide.SELL
    //       ? {
    //           baseTokenAmount: optimalSwapExchange.srcAmount,
    //         }
    //       : { quoteTokenAmount: optimalSwapExchange.destAmount }),
    //     wallet: this.augustusAddress.toLowerCase(),
    //     effectiveTrader: options.txOrigin.toLowerCase(),
    //     marketMakers: [mm],
    //   });

    //   if (rfq.status !== 'success') {
    //     const message = `${this.dexKey}-${
    //       this.network
    //     }: Failed to fetch RFQ for ${this.getPairName(
    //       normalizedSrcToken.address,
    //       normalizedDestToken.address,
    //     )}: ${JSON.stringify(rfq)}`;
    //     this.logger.warn(message);
    //     throw new RfqError(message);
    //   } else if (!rfq.quoteData) {
    //     const message = `${this.dexKey}-${
    //       this.network
    //     }: Failed to fetch RFQ for ${this.getPairName(
    //       normalizedSrcToken.address,
    //       normalizedDestToken.address,
    //     )}. Missing quote data`;
    //     this.logger.warn(message);
    //     throw new RfqError(message);
    //   } else if (!rfq.signature) {
    //     const message = `${this.dexKey}-${
    //       this.network
    //     }: Failed to fetch RFQ for ${this.getPairName(
    //       normalizedSrcToken.address,
    //       normalizedDestToken.address,
    //     )}. Missing signature`;
    //     this.logger.warn(message);
    //     throw new RfqError(message);
    //   } else if (!rfq.gasEstimate) {
    //     const message = `${this.dexKey}-${
    //       this.network
    //     }: Failed to fetch RFQ for ${this.getPairName(
    //       normalizedSrcToken.address,
    //       normalizedDestToken.address,
    //     )}. No gas estimate.`;
    //     this.logger.warn(message);
    //     throw new RfqError(message);
    //   } else if (rfq.quoteData.rfqType !== RFQType.RFQT) {
    //     const message = `${this.dexKey}-${
    //       this.network
    //     }: Failed to fetch RFQ for ${this.getPairName(
    //       normalizedSrcToken.address,
    //       normalizedDestToken.address,
    //     )}. Invalid RFQ type.`;
    //     this.logger.warn(message);
    //     throw new RfqError(message);
    //   }

    //   assert(
    //     rfq.quoteData.baseToken === normalizedSrcToken.address,
    //     `QuoteData baseToken=${rfq.quoteData.baseToken} is different from srcToken=${normalizedSrcToken.address}`,
    //   );
    //   assert(
    //     rfq.quoteData.quoteToken === normalizedDestToken.address,
    //     `QuoteData baseToken=${rfq.quoteData.quoteToken} is different from srcToken=${normalizedDestToken.address}`,
    //   );

    //   const expiryAsBigInt = BigInt(rfq.quoteData.quoteExpiry);
    //   const minDeadline = expiryAsBigInt > 0 ? expiryAsBigInt : BI_MAX_UINT256;

    //   const baseTokenAmount = BigInt(rfq.quoteData.baseTokenAmount);
    //   const quoteTokenAmount = BigInt(rfq.quoteData.quoteTokenAmount);

    //   const srcAmount = BigInt(optimalSwapExchange.srcAmount);
    //   const destAmount = BigInt(optimalSwapExchange.destAmount);

    //   const slippageFactor = options.slippageFactor;

    //   if (side === SwapSide.SELL) {
    //     if (
    //       quoteTokenAmount <
    //       BigInt(
    //         new BigNumber(destAmount.toString())
    //           .times(slippageFactor)
    //           .toFixed(0),
    //       )
    //     ) {
    //       const message = `${this.dexKey}-${this.network}: too much slippage on quote ${side} quoteTokenAmount ${quoteTokenAmount} / destAmount ${destAmount} < ${slippageFactor}`;
    //       this.logger.warn(message);
    //       throw new SlippageCheckError(message);
    //     }
    //   } else {
    //     if (quoteTokenAmount < destAmount) {
    //       // Won't receive enough assets
    //       const message = `${this.dexKey}-${this.network}: too much slippage on quote ${side}  quoteTokenAmount ${quoteTokenAmount} < destAmount ${destAmount}`;
    //       this.logger.warn(message);
    //       throw new SlippageCheckError(message);
    //     } else {
    //       if (
    //         baseTokenAmount >
    //         BigInt(slippageFactor.times(srcAmount.toString()).toFixed(0))
    //       ) {
    //         const message = `${this.dexKey}-${
    //           this.network
    //         }: too much slippage on quote ${side} baseTokenAmount ${baseTokenAmount} / srcAmount ${srcAmount} > ${slippageFactor.toFixed()}`;
    //         this.logger.warn(message);
    //         throw new SlippageCheckError(message);
    //       }
    //     }
    //   }

    return [
      {
        ...optimalSwapExchange,
        data: {
          makerAddress: '0xe84D0CfE6ca3281822050AaCa31578e5205204Dd',
          takerAddress: '0x00',
          // mm,
          // quoteData: rfq.quoteData,
          // signature: rfq.signature,
          // gasEstimate: rfq.gasEstimate,
        },
      },
      // { deadline: minDeadline },
      { deadline: 0n },
    ];
  }
  catch(e: any) {
    if (
      e instanceof Error &&
      e.message.endsWith('User is restricted from using Dexalot')
    ) {
      // this.logger.warn(
      //   `${this.dexKey}-${this.network}: Encountered restricted user=${options.txOrigin}. Adding to local blacklist cache`,
      // );
      // await this.setBlacklist(options.txOrigin);
    } else {
      // await this.restrictMM(mm);
    }

    throw e;
  }

  // This is optional function in case if your implementation has acquired any resources
  // you need to release for graceful shutdown. For example, it may be any interval timer
  releaseResources(): AsyncOrSync<void> {
    // TODO: complete me!
  }
}
