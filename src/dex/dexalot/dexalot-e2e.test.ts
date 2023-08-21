// /* eslint-disable no-console */
import dotenv from 'dotenv';
dotenv.config();

import { testE2E } from '../../../tests/utils-e2e';
import { ethers } from 'ethers';
import { Network, ContractMethod, SwapSide, MAX_UINT } from '../../constants';
import { generateConfig } from '../../config';
import { newTestE2E, getEnv } from '../../../tests/utils-e2e';
import { DEXALOT_API_URL } from './constants';
import {
  SmartTokens,
  GENERIC_ADDR1,
  Tokens,
} from '../../../tests/constants-e2e';
import { RFQConfig } from '../generic-rfq/types';
import { testConfig } from './e2e-test-config';
import { SmartToken } from '../../../tests/smart-tokens';
import { Token } from '../../types';
import { DexalotConfig } from './config';

const PK_KEY = process.env.TEST_PK_KEY;

if (!PK_KEY) {
  throw new Error('Missing TEST_PK_KEY');
}

const testAccount = new ethers.Wallet(PK_KEY!);

jest.setTimeout(1000 * 60 * 3);

const buildConfigForDexalotRFQ = (): RFQConfig => {
  const url = DEXALOT_API_URL; // getEnv('dexalot_url');

  const secret = {
    secretKey: Buffer.from(getEnv('GENERIC_RFQ_SECRET_KEY'), 'base64').toString(
      'binary',
    ),
    accessKey: getEnv('GENERIC_RFQ_ACCESS_KEY'),
    domain: 'paraswap',
  };

  return {
    maker: DexalotConfig.Dexalot[Network.AVALANCHE].maker,
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
  };
};

jest.setTimeout(60000);

const SKIP_TENDERLY = true; //!!getEnv('GENERIC_RFQ_SKIP_TENDERLY', true);
const dexKey = 'dexalot';

describe(`GenericRFQ ${dexKey} E2E`, () => {
  for (const [_network, testCases] of Object.entries(testConfig)) {
    const network = parseInt(_network, 10);
    var tokens = Tokens[network];
    const smartTokens = SmartTokens[network];
    const config = generateConfig(network);

    buildConfigForDexalotRFQ();
    describe(`${Network[network]}`, () => {
      for (const testCase of testCases) {
        let srcToken: Token | SmartToken, destToken: Token | SmartToken;

        if (SKIP_TENDERLY) {
          srcToken = tokens[testCase.srcToken];
          destToken = tokens[testCase.destToken];
        } else {
          // if (!smartTokens.hasOwnProperty(testCase.srcToken)) {
          //   throw new Error(
          //     `Please add "addBalance" and "addAllowance" functions for ${testCase.srcToken} on ${Network[network]} (in constants-e2e.ts).`,
          //   );
          // }
          // if (!smartTokens.hasOwnProperty(testCase.destToken)) {
          //   throw new Error(
          //     `Please add "addBalance" and "addAllowance" functions for ${testCase.destToken} on ${Network[network]} (in constants-e2e.ts).`,
          //   );
          // }
          // srcToken = smartTokens[testCase.srcToken];
          // destToken = smartTokens[testCase.destToken];
          // if (smartTokens.hasOwnProperty(testCase.srcToken)) {
          //   srcToken.addBalance(testAccount.address, MAX_UINT);
          //   srcToken.addAllowance(
          //     testAccount.address,
          //     config.augustusRFQAddress,
          //     MAX_UINT,
          //   );
          // }
          // if (smartTokens.hasOwnProperty(testCase.destToken)) {
          //   destToken.addBalance(testAccount.address, MAX_UINT);
          //     destToken.addAllowance(
          //       testAccount.address,
          //       config.augustusRFQAddress,
          //       MAX_UINT,
          //     );
          // }
        }

        const provider = new ethers.providers.StaticJsonRpcProvider(
          generateConfig(network).privateHttpProvider,
          network,
        );
        const contractMethod = ContractMethod.simpleSwap;
        describe(`${contractMethod}`, () => {
          it(`${testCase.swapSide} ${testCase.srcToken} -> ${testCase.destToken}`, async () => {
            await newTestE2E({
              config,
              srcToken,
              destToken,
              senderAddress: GENERIC_ADDR1,
              thirdPartyAddress: undefined, //testAccount.address,
              _amount: testCase.amount,
              swapSide: testCase.swapSide as SwapSide,
              dexKey: dexKey,
              contractMethod: contractMethod,
              network,
              sleepMs: 10000,
              skipTenderly: SKIP_TENDERLY,
            });
            // await testE2E(
            //   tokens[testCase.srcToken],
            //   tokens[testCase.destToken],
            //   GENERIC_ADDR1,
            //   testCase.amount,
            //   testCase.swapSide as SwapSide,
            //   dexKey,
            //   contractMethod,
            //   network,
            //   provider,
            // );
          });
        });
      }
    });
    break;
  }
});
