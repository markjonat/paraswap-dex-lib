import { DexParams } from './types';
import { DexConfigMap, AdapterMappings } from '../../types';
import { Network, SwapSide } from '../../constants';

export const DexalotConfig: DexConfigMap<DexParams> = {
  Dexalot: {
    // [Network.FUJI]: {
    //   maker: "0x4C72Cd84BB81beD576B162A323f7842c863ab711", //'0xe84D0CfE6ca3281822050AaCa31578e5205204Dd',
    //   rpc: 'https://api.avax-test.network/ext/bc/C/rpc',
    // },
    [Network.AVALANCHE]: {
      maker: '0xd62f9E53Be8884C21f5aa523B3c7D6F9a0050af5', //'0xe84D0CfE6ca3281822050AaCa31578e5205204Dd',
      rpc: 'https://api.avax.network/ext/bc/C/rpc',
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
