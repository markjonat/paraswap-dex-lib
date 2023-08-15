import { Network, SwapSide } from '../../constants';

export const testConfig: {
  [network: number]: Array<{
    srcToken: string;
    destToken: string;
    swapSide: SwapSide;
    amount: string;
  }>;
} = {
  // [Network.AVALANCHE]: [
  //   {
  //     srcToken: 'ALOT',
  //     destToken: 'USDC',
  //     swapSide: SwapSide.BUY,
  //     amount: '10000000',
  //   },
  //   {
  //     srcToken: 'ALOT',
  //     destToken: 'USDC',
  //     swapSide: SwapSide.SELL,
  //     amount: '10000000000000000000',
  //   },
  // ],
  [Network.FUJI]: [
    {
      srcToken: 'ALOT',
      destToken: 'USDC',
      swapSide: SwapSide.BUY,
      amount: '10000000',
    },
    {
      srcToken: 'ALOT',
      destToken: 'USDC',
      swapSide: SwapSide.SELL,
      amount: '10000000000000000000',
    },
  ],
  // [Network.AVALANCHE]: [
  //   {
  //     srcToken: 'AVAX',
  //     destToken: 'USDC',
  //     swapSide: SwapSide.BUY,
  //     amount: '10000000',
  //   },
  //   {
  //     srcToken: 'AVAX',
  //     destToken: 'USDC',
  //     swapSide: SwapSide.SELL,
  //     amount: '10000000000000000000',
  //   },
  // ],
};
