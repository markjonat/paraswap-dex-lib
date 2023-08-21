/* eslint-disable no-console */
import dotenv from 'dotenv';
dotenv.config();

import { Interface, Result } from '@ethersproject/abi';
import { DummyDexHelper } from '../../dex-helper/index';
import { Network, SwapSide } from '../../constants';
import { BI_POWS } from '../../bigint-constants';
import { Dexalot } from './dexalot';
import {
  checkPoolPrices,
  checkPoolsLiquidity,
  checkConstantPoolPrices,
  sleep,
} from '../../../tests/utils';
import { Tokens, GENERIC_ADDR1 } from '../../../tests/constants-e2e';
import { Logger, Address, Token } from '../../types';

/*
  README
  ======

  This test script adds tests for Dexalot general integration
  with the DEX interface. The test cases below are example tests.
  It is recommended to add tests which cover Dexalot specific
  logic.

  You can run this individual test script by running:
  `npx jest src/dex/<dex-name>/<dex-name>-integration.test.ts`

  (This comment should be removed from the final implementation)
*/

function getReaderCalldata(
  exchangeAddress: string,
  readerIface: Interface,
  amounts: bigint[],
  funcName: string,
  // TODO: Put here additional arguments you need
) {
  return amounts.map(amount => ({
    target: exchangeAddress,
    callData: readerIface.encodeFunctionData(funcName, [
      // TODO: Put here additional arguments to encode them
      amount,
    ]),
  }));
}

function decodeReaderResult(
  results: Result,
  readerIface: Interface,
  funcName: string,
) {
  // TODO: Adapt this function for your needs
  return results.map(result => {
    const parsed = readerIface.decodeFunctionResult(funcName, result);
    return BigInt(parsed[0]._hex);
  });
}

async function verifyPricing(
  dexalot: Dexalot,
  srcToken: Token,
  destToken: Token,
  side: SwapSide,
  amounts: bigint[],
  prices: bigint[],
) {
  let diff: number[] = [];
  let outputs: bigint[] = [];
  for (let i = 1; i < amounts.length; i++) {
    if (side == SwapSide.SELL) {
      const quote = await dexalot.getFirmRate(
        srcToken,
        destToken,
        amounts[i].toString(),
        side,
        GENERIC_ADDR1, // '0x05182E579FDfCf69E4390c3411D8FeA1fb6467cf',
      );
      const takerAmount: BigInt = BigInt(quote.order.takerAmount);
      const makerAmount: BigInt = BigInt(quote.order.makerAmount);

      const isAmountEqualToTakerAmount = amounts[i] == takerAmount;

      expect(isAmountEqualToTakerAmount).toBe(true);

      const makerAmountLowerBounds: BigInt =
        (BigInt(prices[i]) * BigInt(9900)) / BigInt(10000);
      const makerAmountUpperBounds: BigInt =
        (BigInt(prices[i]) * BigInt(10100)) / BigInt(10000);

      const isGreaterThanLowerBounds = makerAmount >= makerAmountLowerBounds;
      const isLessThanUpperBounds = makerAmount <= makerAmountUpperBounds;

      // diff.push(Number((makerAmount * 10000n) / BigInt(prices[i])) / 100);
      // outputs.push(makerAmount);

      expect(isGreaterThanLowerBounds).toBe(true);
      expect(isLessThanUpperBounds).toBe(true);
      continue;
    }

    const quote = await dexalot.getFirmRate(
      srcToken,
      destToken,
      prices[i].toString(),
      side,
      GENERIC_ADDR1,
      //'0x05182E579FDfCf69E4390c3411D8FeA1fb6467cf',
    );

    const takerAmount: BigInt = BigInt(quote.order.takerAmount);
    const makerAmount: BigInt = BigInt(quote.order.makerAmount);

    const isAmountEqualToMakerAmount = prices[i] == makerAmount;

    // expect(isAmountEqualToMakerAmount).toBe(true);

    const takerAmountLowerBounds: BigInt =
      (BigInt(amounts[i].toString()) * BigInt(9900)) / BigInt(10000);
    const takerAmountUpperBounds: BigInt =
      (BigInt(amounts[i].toString()) * BigInt(10100)) / BigInt(10000);

    const isGreaterThanLowerBounds = takerAmount >= takerAmountLowerBounds;
    const isLessThanUpperBounds = takerAmount <= takerAmountUpperBounds;
    expect(isGreaterThanLowerBounds).toBe(true);
    expect(isLessThanUpperBounds).toBe(true);

    // diff.push((takerAmount * BigInt(10000)) /   )
    // diff.push(Number((takerAmount * 10000n) / BigInt(amounts[i])) / 100);
    // outputs.push(takerAmount);
  }

  // console.log(diff);
}

async function testPricingOnNetwork(
  dexalot: Dexalot,
  network: Network,
  dexKey: string,
  blockNumber: number,
  srcTokenSymbol: string,
  destTokenSymbol: string,
  side: SwapSide,
  amounts: bigint[],
  funcNameToCheck: string,
) {
  const networkTokens = Tokens[network];

  const pools = await dexalot.getPoolIdentifiers(
    networkTokens[srcTokenSymbol],
    networkTokens[destTokenSymbol],
    side,
    blockNumber,
  );
  console.log(
    `${srcTokenSymbol} <> ${destTokenSymbol} Pool Identifiers: `,
    pools,
  );

  expect(pools.length).toBeGreaterThan(0);

  const poolPrices = await dexalot.getPricesVolume(
    networkTokens[srcTokenSymbol],
    networkTokens[destTokenSymbol],
    amounts,
    side,
    blockNumber,
    pools,
  );
  console.log(
    `${srcTokenSymbol} <> ${destTokenSymbol} Pool Prices: `,
    poolPrices,
  );

  expect(poolPrices).not.toBeNull();
  if (dexalot.hasConstantPriceLargeAmounts) {
    checkConstantPoolPrices(poolPrices!, amounts, dexKey);
  } else {
    checkPoolPrices(poolPrices!, amounts, side, dexKey);
  }

  await verifyPricing(
    dexalot,
    networkTokens[srcTokenSymbol],
    networkTokens[destTokenSymbol],
    side,
    amounts,
    poolPrices![0].prices,
  );
}

jest.setTimeout(200000);

describe('Dexalot', function () {
  const dexKey = 'Dexalot';
  let blockNumber: number;
  let dexalot: Dexalot;

  describe('Avalanche', () => {
    const network = Network.AVALANCHE;
    const dexHelper = new DummyDexHelper(network);

    const tokens = Tokens[network];

    // TODO: Put here token Symbol to check against
    // Don't forget to update relevant tokens in constant-e2e.ts
    // const srcTokenSymbol = 'ALOT';
    const srcTokenSymbol = 'AVAX';
    const destTokenSymbol = 'USDC';

    // TODO: remove this when testing outside of dev
    // tokens['USDC'].address = '0x68B773B8C10F2ACE8aC51980A1548B6B48a2eC54';
    // tokens['ALOT'].address = '0x9983F755Bbd60d1886CbfE103c98C272AA0F03d6';
    // tokens['AVAX'].address = '0x0000000000000000000000000000000000000000';

    const amountsForSell = [
      0n,
      1n * BI_POWS[tokens[srcTokenSymbol].decimals],
      2n * BI_POWS[tokens[srcTokenSymbol].decimals],
      3n * BI_POWS[tokens[srcTokenSymbol].decimals],
      4n * BI_POWS[tokens[srcTokenSymbol].decimals],
      5n * BI_POWS[tokens[srcTokenSymbol].decimals],
      6n * BI_POWS[tokens[srcTokenSymbol].decimals],
      7n * BI_POWS[tokens[srcTokenSymbol].decimals],
      8n * BI_POWS[tokens[srcTokenSymbol].decimals],
      9n * BI_POWS[tokens[srcTokenSymbol].decimals],
      10n * BI_POWS[tokens[srcTokenSymbol].decimals],
    ];

    const amountsForBuy = [
      0n,
      2n * BI_POWS[tokens[destTokenSymbol].decimals],
      4n * BI_POWS[tokens[destTokenSymbol].decimals],
      6n * BI_POWS[tokens[destTokenSymbol].decimals],
      8n * BI_POWS[tokens[destTokenSymbol].decimals],
      10n * BI_POWS[tokens[destTokenSymbol].decimals],
      12n * BI_POWS[tokens[destTokenSymbol].decimals],
      14n * BI_POWS[tokens[destTokenSymbol].decimals],
      16n * BI_POWS[tokens[destTokenSymbol].decimals],
      18n * BI_POWS[tokens[destTokenSymbol].decimals],
      20n * BI_POWS[tokens[destTokenSymbol].decimals],
    ];

    // beforeAll(async () => {
    //   blockNumber = await dexHelper.web3Provider.eth.getBlockNumber();
    //   dexalot = new Dexalot(network, dexKey, dexHelper);
    //   if (dexalot.initializePricing) {
    //     await dexalot.initializePricing(blockNumber);
    //   }
    //   await sleep(5000);
    // });

    it('getPoolIdentifiers and getPricesVolume SELL', async function () {
      blockNumber = await dexHelper.web3Provider.eth.getBlockNumber();
      dexalot = new Dexalot(network, dexKey, dexHelper);

      if (dexalot.initializePricing) {
        await dexalot.initializePricing(blockNumber);
      }
      await sleep(6000);

      await testPricingOnNetwork(
        dexalot,
        network,
        dexKey,
        blockNumber,
        srcTokenSymbol,
        destTokenSymbol,
        SwapSide.SELL,
        amountsForSell,
        '', // TODO: Put here proper function name to check pricing
      );

      await dexalot.stop();
    });

    it('getPoolIdentifiers and getPricesVolume BUY', async function () {
      blockNumber = await dexHelper.web3Provider.eth.getBlockNumber();
      dexalot = new Dexalot(network, dexKey, dexHelper);
      if (dexalot.initializePricing) {
        await dexalot.initializePricing(blockNumber);
      }

      await sleep(6000);
      await testPricingOnNetwork(
        dexalot,
        network,
        dexKey,
        blockNumber,
        srcTokenSymbol,
        destTokenSymbol,
        SwapSide.BUY,
        amountsForBuy,
        '', // TODO: Put here proper function name to check pricing
      );

      await dexalot.stop();
    });

    // // // TODO: remove initialize pricing
    it('getTopPoolsForToken', async function () {
      // We have to check without calling initializePricing, because
      // pool-tracker is not calling that function
      blockNumber = await dexHelper.web3Provider.eth.getBlockNumber();
      const newDexalot = new Dexalot(network, dexKey, dexHelper);
      if (newDexalot.initializePricing) {
        await newDexalot.initializePricing(blockNumber);
      }
      await sleep(3000);
      // const newDexalot = new Dexalot(network, dexKey, dexHelper);
      // if (newDexalot.updatePoolState) {
      //   await newDexalot.updatePoolState();
      // }
      const poolLiquidity = await newDexalot.getTopPoolsForToken(
        tokens[srcTokenSymbol].address,
        10,
      );
      console.log(`${srcTokenSymbol} Top Pools:`, poolLiquidity);

      if (!newDexalot.hasConstantPriceLargeAmounts) {
        checkPoolsLiquidity(
          poolLiquidity,
          Tokens[network][srcTokenSymbol].address,
          dexKey,
        );
      }
    });

    afterAll(() => {
      dexalot.stop();
    });
  });
});
