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
import { assert } from 'ts-essentials';
import { PairTypes } from '../balancer-v2/LinearPool';
import { TokenData } from './types';
import { ethers } from 'ethers';
import { FirmReturnObject, RFQOrder } from './types';
import { _TypedDataEncoder } from 'ethers/lib/utils';
import { Interface, JsonFragment } from '@ethersproject/abi';
import MainnetRFQABI from '../../abi/dexalot/mainnetRFQ.json';

export class Dexalot extends SimpleExchange implements IDex<DexalotData> {
  readonly hasConstantPriceLargeAmounts = false;
  // TODO: set true here if protocols works only with wrapped asset
  readonly needWrapNative = false;

  readonly isFeeOnTransferSupported = false;

  public static dexKeysWithNetwork: { key: string; networks: Network[] }[] =
    getDexKeysWithNetwork(DexalotConfig);

  logger: Logger;
  private rfqInterface: Interface;
  private rateFetcher: RateFetcher;

  constructor(
    readonly network: Network,
    readonly dexKey: string,
    readonly dexHelper: IDexHelper,
    protected adapters = Adapters[network] || {}, // TODO: add any additional optional params to support other fork DEXes
  ) {
    super(dexHelper, dexKey);
    this.logger = dexHelper.getLogger(dexKey);

    this.rfqInterface = new Interface(MainnetRFQABI as JsonFragment[]);

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
        maker: '0xd62f9E53Be8884C21f5aa523B3c7D6F9a0050af5',
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

    const _amountsInFormatted = amounts.map(a =>
      Number(ethers.utils.formatUnits(a, inDecimals)),
    );

    const isBidBook = book == 'bids' ? true : false;

    const outputs = this.calcOutputs(
      orderBook,
      _amountsInFormatted,
      outDecimals,
      isBidBook,
    );

    this.logger.info(outputs);

    // TODO: call ratefetcher firm
    // Migh make sense to do this in different function so not in integration test?

    // TODO: input correct values
    return [
      {
        prices: outputs,
        unit: BigInt(outDecimals),
        data: {
          maker: DexalotConfig.Dexalot[Network.AVALANCHE].maker,
        },
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
    const { maker } = data;

    // Encode here the payload for adapter
    const payload = '';

    return {
      targetExchange: maker,
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
    // const { makerAddress } = data;

    assert(
      data.quote !== undefined,
      `${this.dexKey}-${this.network}: quoteData undefined`,
    );

    // Encode here the transaction arguments
    const swapFunction = 'simpleSwap';
    const swapFunctionParams = [
      {
        nonceAndMeta: data.quote.nonceAndMeta,
        expiry: data.quote.expiry,
        makerAsset: data.quote.makerAsset,
        takerAsset: data.quote.takerAsset,
        maker: data.quote.maker,
        taker: data.quote.taker,
        makerAmount: data.quote.makerAmount,
        takerAmount: data.quote.takerAmount,
      },
      data.quote.signature,
    ];

    const swapData = this.rfqInterface.encodeFunctionData(
      swapFunction,
      swapFunctionParams,
    );

    // TODO: look into implementing
    return this.buildSimpleParamWithoutWETHConversion(
      srcToken,
      srcAmount,
      destToken,
      destAmount,
      swapData,
      data.maker,
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

  getTokenFromAddress(address: string): Token {
    const tokens = this.rateFetcher.addressToTokenMap;
    return tokens[address.toLowerCase()] as Token;
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

  // buildOrderData(
  //   chainId: Network,
  //   params: RFQOrder,
  //   contractAddress: string,
  // ) {
  //   const domain = {
  //     name: "Dexalot",
  //     version: "1",
  //     chainId: chainId,
  //     verifyingContract: contractAddress,
  //   };

  //   const types = {
  //     Quote: [
  //       { name: "nonceAndMeta", type: "uint256", },
  //       { name: "expiry", type: "uint128", },
  //       { name: "makerAsset", type: "address", },
  //       { name: "takerAsset", type: "address", },
  //       { name: "maker", type: "address", },
  //       { name: "taker", type: "address", },
  //       { name: "makerAmount", type: "uint256", },
  //       { name: "takerAmount", type: "uint256", },
  //     ],
  //   };

  //   return { domain, types };
  // }

  // calculateOrderHash(
  //   chainId: Network,
  //   params: RFQOrder,
  //   contractAddress: string,
  // ) {
  //   const { domain, types } = this.buildOrderData(
  //     chainId,
  //     params,
  //     contractAddress,
  //   );
  //   return _TypedDataEncoder.hash(domain, types, params);
  // }

  calculateHash(chainId: Network, params: RFQOrder, verifierContract: string) {
    const structType =
      '0x95afddf5e4bb9f692716b7fdff640e6b8a0d2869597405c6e9d35857ed19a150';
    const encoder = new ethers.utils.AbiCoder();
    const hashedStruct = ethers.utils.keccak256(
      encoder.encode(
        [
          'bytes32',
          'uint256',
          'uint128',
          'address',
          'address',
          'address',
          'address',
          'uint256',
          'uint256',
        ],
        [
          structType,
          params.nonceAndMeta,
          params.expiry,
          params.makerAsset,
          params.takerAsset,
          params.maker,
          params.taker,
          params.makerAmount,
          params.takerAmount,
        ],
      ),
    );

    const typeHash =
      '0x8b73c3c69bb8fe3d512ecc4cf759cc79239f7b179b0ffacaa9a75d522b39400f';
    const nameHash =
      '0xd2ef1b0ffc50b2e9cd67fedd1f364a1cc9de9821aa5f08b3504728919074b0d7';
    const versionHash =
      '0xc89efdaa54c0f20c7adf612882df0950f5a951637e0307cdcb4c672f298b8bc6';
    const domainSeperator = ethers.utils.keccak256(
      encoder.encode(
        ['bytes32', 'bytes32', 'bytes32', 'uint', 'address'],
        [typeHash, nameHash, versionHash, chainId, verifierContract],
      ),
    );

    const hash = ethers.utils.keccak256(
      ethers.utils.solidityPack(
        ['string', 'bytes32', 'bytes32'],
        ['\x19\x01', domainSeperator, hashedStruct],
      ),
    );

    return hash;
  }

  async preProcessTransaction(
    optimalSwapExchange: OptimalSwapExchange<DexalotData>,
    srcToken: Token,
    destToken: Token,
    side: SwapSide,
    options: PreprocessTransactionOptions,
  ): Promise<[OptimalSwapExchange<DexalotData>, ExchangeTxInfo]> {
    const blacklistedString: string =
      (await this.dexHelper.cache.get(
        this.dexKey,
        this.dexHelper.config.data.network,
        this.rateFetcher.blackListCacheKey,
      )) || '[]';
    const blacklist: string[] = JSON.parse(blacklistedString);

    if (blacklist.includes(options.txOrigin)) {
      this.logger.warn(
        `${this.dexKey}-${this.network}: blacklisted TX Origin address '${options.txOrigin}' trying to build a transaction. Bailing...`,
      );
      throw new Error(
        `${this.dexKey}-${
          this.network
        }: user=${options.txOrigin.toLowerCase()} is blacklisted`,
      );
    }

    const chainId = this.network;

    if (BigInt(optimalSwapExchange.srcAmount) === 0n) {
      throw new Error('getFirmRate failed with srcAmount == 0');
    }

    try {
      const orderResp = await this.rateFetcher.getFirmRate(
        srcToken,
        destToken,
        optimalSwapExchange.srcAmount,
        side,
        options.txOrigin,
      );

      // const order: RFQOrder = {
      //   nonceAndMeta: BigInt(orderResp.order.nonceAndMeta),
      //   expiry: orderResp.order.expiry,
      //   makerAsset: orderResp.order.makerAsset,
      //   takerAsset: orderResp.order.takerAsset,
      //   maker: orderResp.order.maker,
      //   taker: orderResp.order.taker,
      //   makerAmount: BigInt(orderResp.order.makerAmount),
      //   takerAmount: BigInt(orderResp.order.takerAmount),
      // }

      const order: RFQOrder = {
        nonceAndMeta: orderResp.order.nonceAndMeta,
        expiry: orderResp.order.expiry,
        makerAsset: orderResp.order.makerAsset,
        takerAsset: orderResp.order.takerAsset,
        maker: orderResp.order.maker,
        taker: orderResp.order.taker,
        makerAmount: orderResp.order.makerAmount,
        takerAmount: orderResp.order.takerAmount,
      };

      assert(order.maker != null, `Invalid Order: No maker address`);
      assert(order.taker != null, `Invalid Order: No taker address`);
      assert(order.makerAmount != null, `Invalid Order: No maker amount`);
      assert(order.takerAmount != null, `Invalid Order: No maker amount`);
      assert(order.makerAsset != null, `Invalid Order: No maker asset`);
      assert(order.takerAsset != null, `Invalid Order: No taker asset`);
      assert(order.nonceAndMeta != null, `Invalid Order: No nonceAndMeta`);
      assert(order.expiry != null, `Invalid Order: No expiry`);
      assert(orderResp.order.signature != null, `Invalid Order: No signature`);

      // const hash = this.calculateOrderHash(chainId, order, order.maker)
      const hash = this.calculateHash(chainId, order, order.maker);

      const provider = new ethers.providers.StaticJsonRpcProvider(
        DexalotConfig.Dexalot[this.network].rpc,
        chainId,
      );

      // const rfqContract = new ethers.Contract(order.maker, ["function isValidSignature(bytes32 _hash, bytes memory _signature) external view returns (bytes4)"], provider)
      // const magicNumber = await rfqContract.isValidSignature(hash, orderResp.order.signature);
      // // const magicNumber2 = await rfqContract.isValidSignature(hash2, orderResp.order.signature);
      // // assert(
      // //   magicNumber2 == "0x1626ba7e",
      // //   `Invalid Signature`,
      // // );
      // assert(
      //   magicNumber == "0x1626ba7e",
      //   `Invalid Signature`,
      // );

      // if (side === SwapSide.SELL) {
      //   const makerAmountLowerBounds: bigint = (BigInt(optimalSwapExchange.destAmount.toString()) * BigInt(9900)) / BigInt(10000);
      //   const makerAmountUpperBounds: bigint = (BigInt(optimalSwapExchange.destAmount.toString()) * BigInt(10100)) / BigInt(10000);
      //   assert (
      //     BigInt(order.makerAmount) < makerAmountUpperBounds,
      //     "Too much Slippage"
      //   )
      //   assert (
      //     BigInt(order.makerAmount) > makerAmountLowerBounds,
      //     "Too much Slippage"
      //   )
      // } else {
      //   const makerAmountLowerBounds: bigint = (BigInt(optimalSwapExchange.srcAmount.toString()) * BigInt(9900)) / BigInt(10000);
      //   const makerAmountUpperBounds: bigint = (BigInt(optimalSwapExchange.srcAmount.toString()) * BigInt(10100)) / BigInt(10000);
      //   assert (
      //     BigInt(order.makerAmount) < makerAmountUpperBounds,
      //     "Too much Slippage"
      //   )
      //   assert (
      //     BigInt(order.makerAmount) > makerAmountLowerBounds,
      //     "Too much Slippage"
      //   )
      // }

      const dexalotData: DexalotData = {
        maker: order.maker,
        quote: {
          nonceAndMeta: order.nonceAndMeta,
          expiry: order.expiry,
          makerAsset: order.makerAsset,
          takerAsset: order.takerAsset,
          maker: order.maker,
          taker: order.taker,
          makerAmount: order.makerAmount,
          takerAmount: order.takerAmount,
          signature: orderResp.order.signature,
        },
      };

      return [
        {
          ...optimalSwapExchange,
          data: dexalotData,
        },
        { deadline: 0n },
      ];
    } catch (e: any) {
      console.log(e);
      throw new Error(`Invalid Quote`);
    }
  }

  // This is optional function in case if your implementation has acquired any resources
  // you need to release for graceful shutdown. For example, it may be any interval timer
  releaseResources(): AsyncOrSync<void> {
    // TODO: complete me!
  }
}
