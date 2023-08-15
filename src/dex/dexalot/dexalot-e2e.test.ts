// /* eslint-disable no-console */
// import dotenv from 'dotenv';
// dotenv.config();

// import { testE2E } from '../../../tests/utils-e2e';
// import {
//   Tokens,
//   Holders,
//   NativeTokenSymbols,
// } from '../../../tests/constants-e2e';
// import { Network, ContractMethod, SwapSide } from '../../constants';
// import { StaticJsonRpcProvider } from '@ethersproject/providers';
// import { generateConfig } from '../../config';
// import { logger } from 'ethers';

// /*
//   README
//   ======

//   This test script should add e2e tests for Dexalot. The tests
//   should cover as many cases as possible. Most of the DEXes follow
//   the following test structure:
//     - DexName
//       - ForkName + Network
//         - ContractMethod
//           - ETH -> Token swap
//           - Token -> ETH swap
//           - Token -> Token swap

//   The template already enumerates the basic structure which involves
//   testing simpleSwap, multiSwap, megaSwap contract methods for
//   ETH <> TOKEN and TOKEN <> TOKEN swaps. You should replace tokenA and
//   tokenB with any two highly liquid tokens on Dexalot for the tests
//   to work. If the tokens that you would like to use are not defined in
//   Tokens or Holders map, you can update the './tests/constants-e2e'

//   Other than the standard cases that are already added by the template
//   it is highly recommended to add test cases which could be specific
//   to testing Dexalot (Eg. Tests based on poolType, special tokens,
//   etc).

//   You can run this individual test script by running:
//   `npx jest src/dex/<dex-name>/<dex-name>-e2e.test.ts`

//   e2e tests use the Tenderly fork api. Please add the following to your
//   .env file:
//   TENDERLY_TOKEN=Find this under Account>Settings>Authorization.
//   TENDERLY_ACCOUNT_ID=Your Tenderly account name.
//   TENDERLY_PROJECT=Name of a Tenderly project you have created in your
//   dashboard.

//   (This comment should be removed from the final implementation)
// */

// function testForNetwork(
//   network: Network,
//   dexKey: string,
//   tokenASymbol: string,
//   tokenBSymbol: string,
//   tokenAAmount: string,
//   tokenBAmount: string,
//   nativeTokenAmount: string,
// ) {
//   // const provider = new StaticJsonRpcProvider(
//   //   generateConfig(network).privateHttpProvider,
//   //   network,
//   // );
//   const provider = new StaticJsonRpcProvider(
//     "https://api.avax-test.network/ext/bc/C/rpc",//"https://rpc.tenderly.co/fork/2e53c240-825b-4bf2-bfee-2abd8734fda9",
//     43113,
//   );

//   // 43113
//   const tokens = Tokens[network];
//   const holders = Holders[network];
//   const nativeTokenSymbol = NativeTokenSymbols[network];

//   // TODO: Add any direct swap contractMethod name if it exists
//   const sideToContractMethods = new Map([
//     [
//       SwapSide.SELL,
//       [
//         ContractMethod.simpleSwap,
//         // ContractMethod.multiSwap,
//         // ContractMethod.megaSwap,
//       ],
//     ],
//     // TODO: If buy is not supported remove the buy contract methods
//     // [SwapSide.BUY, [ContractMethod.simpleBuy, ContractMethod.buy]],
//   ]);

//   describe(`${network}`, () => {
//     sideToContractMethods.forEach((contractMethods, side) =>
//       describe(`${side}`, () => {
//         contractMethods.forEach((contractMethod: ContractMethod) => {
//           describe(`${contractMethod}`, () => {
//             // it(`${nativeTokenSymbol} -> ${tokenASymbol}`, async () => {
//             //   await testE2E(
//             //     tokens[nativeTokenSymbol],
//             //     tokens[tokenASymbol],
//             //     holders[nativeTokenSymbol],
//             //     side === SwapSide.SELL ? nativeTokenAmount : tokenAAmount,
//             //     side,
//             //     dexKey,
//             //     contractMethod,
//             //     network,
//             //     provider,
//             //   );
//             // });
//             // it(`${tokenASymbol} -> ${nativeTokenSymbol}`, async () => {
//             //   await testE2E(
//             //     tokens[tokenASymbol],
//             //     tokens[nativeTokenSymbol],
//             //     holders[tokenASymbol],
//             //     side === SwapSide.SELL ? tokenAAmount : nativeTokenAmount,
//             //     side,
//             //     dexKey,
//             //     contractMethod,
//             //     network,
//             //     provider,
//             //   );
//             // });
//             it(`${tokenASymbol} -> ${tokenBSymbol}`, async () => {

//               await testE2E(
//                 tokens[tokenASymbol],
//                 tokens[tokenBSymbol],
//                 holders[tokenASymbol],
//                 side === SwapSide.SELL ? tokenAAmount : tokenBAmount,
//                 side,
//                 dexKey,
//                 contractMethod,
//                 network,
//                 provider,

//               );
//             });
//           });
//         });
//       }),
//     );
//   });
// }

// describe('Dexalot E2E', () => {
//   const dexKey = 'Dexalot';

//   describe('AVALANCHE', () => {
//     const network = Network.AVALANCHE;

//     // TODO: Modify the tokenASymbol, tokenBSymbol, tokenAAmount;
//     const tokenASymbol: string = 'ALOT';
//     const tokenBSymbol: string = 'USDC';

//     const tokenAAmount: string = '10000000000000000000';
//     const tokenBAmount: string = '50000000';
//     const nativeTokenAmount = '1000000000000000000';

//     testForNetwork(
//       network,
//       dexKey,
//       tokenASymbol,
//       tokenBSymbol,
//       tokenAAmount,
//       tokenBAmount,
//       nativeTokenAmount,
//     );

//     // TODO: Add any additional test cases required to test Dexalot
//   });
// });

import dotenv from 'dotenv';
dotenv.config();

import { testE2E } from '../../../tests/utils-e2e';
import { ethers } from 'ethers';
import { Network, ContractMethod, SwapSide, MAX_UINT } from '../../constants';
import { generateConfig } from '../../config';
import { newTestE2E, getEnv } from '../../../tests/utils-e2e';
import {
  SmartTokens,
  GENERIC_ADDR1,
  Tokens,
} from '../../../tests/constants-e2e';
import { RFQConfig } from '../generic-rfq/types';
import { testConfig } from './e2e-test-config';
import { SmartToken } from '../../../tests/smart-tokens';
import { Token } from '../../types';

const PK_KEY = process.env.TEST_PK_KEY;

if (!PK_KEY) {
  throw new Error('Missing TEST_PK_KEY');
}

const testAccount = new ethers.Wallet(PK_KEY!);

jest.setTimeout(1000 * 60 * 3);

const buildConfigForDexalotRFQ = (): RFQConfig => {
  const url = getEnv('dexalot_url');

  const secret = {
    secretKey: Buffer.from(getEnv('GENERIC_RFQ_SECRET_KEY'), 'base64').toString(
      'binary',
    ),
    accessKey: getEnv('GENERIC_RFQ_ACCESS_KEY'),
    domain: 'paraswap',
  };

  const pathToRemove = getEnv('GENERIC_RFQ_PATH_TO_OVERRIDE', true);

  return {
    maker: '0xe84D0CfE6ca3281822050AaCa31578e5205204Dd', //getEnv('GENERIC_RFQ_MAKER_ADDRESS'),
    tokensConfig: {
      reqParams: {
        url: `${url}/tokens`,
        method: 'GET',
      },
      secret,
      intervalMs: 1000 * 60 * 60 * 10, // every 10 minutes
      dataTTLS: 1000 * 60 * 60 * 11, // ttl 11 minutes
    },
    pairsConfig: {
      reqParams: {
        url: `${url}/pairs`,
        method: 'GET',
      },
      secret,
      intervalMs: 1000 * 60 * 60 * 10, // every 10 minutes
      dataTTLS: 1000 * 60 * 60 * 11, // ttl 11 minutes
    },
    rateConfig: {
      reqParams: {
        url: `${url}/prices`,
        method: 'GET',
      },
      secret,
      intervalMs: 1000 * 60 * 60 * 1, // every 1 minute
      dataTTLS: 1000 * 60 * 60 * 1, // ttl 1 minute
    },
    firmRateConfig: {
      url: `${url}/firm`,
      method: 'POST',
      secret,
      headers: {
        api_key: '23-ps',
      },
    },
    blacklistConfig: {
      reqParams: {
        url: `${url}/blacklist`,
        method: 'GET',
      },
      secret,
      intervalMs: 1000 * 60 * 60 * 10,
      dataTTLS: 1000 * 60 * 60 * 11,
    },
    // pathToRemove,
  };
};

const SKIP_TENDERLY = !!getEnv('GENERIC_RFQ_SKIP_TENDERLY', true);
const dexKey = 'dexalot';

describe(`GenericRFQ ${dexKey} E2E`, () => {
  for (const [_network, testCases] of Object.entries(testConfig)) {
    const network = parseInt(_network, 10);
    var tokens = Tokens[network];
    tokens['USDC'].address = '0x68B773B8C10F2ACE8aC51980A1548B6B48a2eC54'; // TODO: delete on mainnet
    tokens['ALOT'].address = '0x9983F755Bbd60d1886CbfE103c98C272AA0F03d6'; // // TODO: delete on mainnet
    // tokens['AVAX'].address = '0x0000000000000000000000000000000000000000';
    const smartTokens = SmartTokens[network];
    // smartTokens["USDC"].address = "0x68B773B8C10F2ACE8aC51980A1548B6B48a2eC54" // TODO: delete on mainnet
    // smartTokens["ALOT"].address = "0x9983F755Bbd60d1886CbfE103c98C272AA0F03d6" // // TODO: delete on mainnet
    const config = generateConfig(network);

    config.rfqConfigs[dexKey] = buildConfigForDexalotRFQ();
    describe(`${Network[network]}`, () => {
      for (const testCase of testCases) {
        let srcToken: Token | SmartToken, destToken: Token | SmartToken;

        if (SKIP_TENDERLY) {
          srcToken = tokens[testCase.srcToken];
          destToken = tokens[testCase.destToken];
        } else {
          if (!smartTokens.hasOwnProperty(testCase.srcToken)) {
            throw new Error(
              `Please add "addBalance" and "addAllowance" functions for ${testCase.srcToken} on ${Network[network]} (in constants-e2e.ts).`,
            );
          }
          if (!smartTokens.hasOwnProperty(testCase.destToken)) {
            throw new Error(
              `Please add "addBalance" and "addAllowance" functions for ${testCase.destToken} on ${Network[network]} (in constants-e2e.ts).`,
            );
          }
          srcToken = smartTokens[testCase.srcToken];
          destToken = smartTokens[testCase.destToken];

          srcToken.addBalance(testAccount.address, MAX_UINT);
          srcToken.addAllowance(
            testAccount.address,
            config.augustusRFQAddress,
            MAX_UINT,
          );

          destToken.addBalance(testAccount.address, MAX_UINT);
          destToken.addAllowance(
            testAccount.address,
            config.augustusRFQAddress,
            MAX_UINT,
          );
        }
        // console.log(testCase.amount);
        const provider = new ethers.providers.StaticJsonRpcProvider(
          generateConfig(network).privateHttpProvider,
          network,
        );
        const contractMethod = ContractMethod.simpleBuy;
        describe(`${contractMethod}`, () => {
          it(`${testCase.swapSide} ${testCase.srcToken} -> ${testCase.destToken}`, async () => {
            // await newTestE2E({
            //   config,
            //   srcToken,
            //   destToken,
            //   senderAddress: GENERIC_ADDR1,
            //   thirdPartyAddress: testAccount.address,
            //   _amount: testCase.amount,
            //   swapSide: testCase.swapSide as SwapSide,
            //   dexKey: dexKey,
            //   contractMethod,
            //   network,
            //   sleepMs: 5000,
            //   skipTenderly: SKIP_TENDERLY,
            // });
            await testE2E(
              tokens[testCase.srcToken],
              tokens[testCase.destToken],
              GENERIC_ADDR1,
              testCase.amount,
              testCase.swapSide as SwapSide,
              dexKey,
              contractMethod,
              network,
              provider,
            );
          });
        });
      }
    });
    break;
  }
});
