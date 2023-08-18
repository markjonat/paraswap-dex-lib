import { Address, Token } from '../../types';
import { RequestHeaders } from '../../dex-helper';
import { RequestConfig } from '../../dex-helper/irequest-wrapper';

export type PoolState = {
  // TODO: poolState is the state of event
  // subscriber. This should be the minimum
  // set of parameters required to compute
  // pool prices. Complete me!
};

export type DexalotData = {
  // TODO: DexalotData is the dex data that is
  // returned by the API that can be used for
  // tx building. The data structure should be minimal.
  // Complete me!
  maker: string;
  quote?: {
    nonceAndMeta: string;
    expiry: number;
    makerAsset: string;
    takerAsset: string;
    maker: string;
    taker: string;
    makerAmount: string;
    takerAmount: string;
    signature: string;
  };

  // quoteData: RFQOrder;
  // signature: string;
};

export type DexParams = {
  // TODO: DexParams is set of parameters the can
  // be used to initiate a DEX fork.
  maker: Address;
  rpc: string;
};

export type TokenData = {
  symbol: string;
  name: string;
  description: string;
  address: any;
  decimals: number;
  type: string;
};

export type TokenWithInfo = Token & {
  name: string;
  description: string;
};

export type TokensResponse = {
  tokens: {
    [token: string]: TokenData;
  };
};

type PairData = {
  base: string;
  quote: string;
  liquidityUSD: number;
};

export type PairMap = {
  [pairName: string]: PairData;
};

export type PairsResponse = {
  pairs: {
    [pair: string]: PairData;
  };
};

type PriceData = {
  bids: string[][];
  asks: string[][];
};

export type PricesResponse = {
  prices: {
    [pair: string]: PriceData;
  };
};

type BestPriceData = {
  bestBid: string;
  bestAsk: string;
  midPrice: string;
  weightedPrice: string;
};

export type BestPrices = {
  bestPrices: {
    [pair: string]: BestPriceData;
  };
};

export type FirmReturnObject = {
  order: {
    nonceAndMeta: string;
    expiry: number;
    makerAsset: string;
    takerAsset: string;
    maker: string;
    taker: string;
    makerAmount: string;
    takerAmount: string;
    signature: string;
  };
};

export type RFQOrder = {
  nonceAndMeta: string;
  expiry: number;
  makerAsset: Address;
  takerAsset: Address;
  maker: Address;
  taker: Address;
  makerAmount: string;
  takerAmount: string;
};

export type BlackListResponse = {
  blacklist: string[];
};

export type DexalotRFQConfig = {
  tokensConfig: {
    url: string;
    headers?: RequestHeaders;
    reqParams?: any;
  };
  pairsConfig: {
    url: string;
    headers?: RequestHeaders;
    reqParams?: any;
  };
  pricesConfig: {
    url: string;
    headers?: RequestHeaders;
    reqParams?: any;
    // dataTTLS: number;
  };
  blacklistConfig: {
    url: string;
    headers?: RequestHeaders;
    reqParams?: any;
  };
  intervalMs: number;
};

export type RFQConfig = {
  tokensConfig: FetcherParams;
  pairsConfig: FetcherParams;
  rateConfig: FetcherParams;
  firmRateConfig: RequestConfigWithAuth;
  blacklistConfig?: FetcherParams;
  maker: Address;
  pathToRemove?: string;
};

export type FetcherParams = {
  reqParams: RequestConfig;
  secret: RFQSecret;
  intervalMs: number;
  dataTTLS: number;
};

export type RFQSecret = {
  domain: string;
  accessKey: string;
  secretKey: string;
};

type RequestConfigWithAuth = RequestConfig & {
  secret?: RFQSecret;
};
