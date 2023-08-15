import { DexParams } from './types';
import { DexConfigMap, AdapterMappings } from '../../types';
import { Network, SwapSide } from '../../constants';

export const DexalotConfig: DexConfigMap<DexParams> = {
  Dexalot: {
    [Network.AVALANCHE]: {
      rfqAddress: '0xe84D0CfE6ca3281822050AaCa31578e5205204Dd',
      maker: '0xe84D0CfE6ca3281822050AaCa31578e5205204Dd',
    },
  },
};

export const Adapters: Record<number, AdapterMappings> = {
  // TODO: add adapters for each chain
  // This is an example to copy
  [Network.AVALANCHE]: {
    [SwapSide.SELL]: [{ name: 'AvalancheAdapter02', index: 1 }],
    [SwapSide.BUY]: [{ name: 'AvalancheBuyAdapter', index: 3 }],
  },
};
