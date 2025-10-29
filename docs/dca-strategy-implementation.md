# Implementing a Dollar-Cost Averaging (DCA) Strategy with Raindex

This guide explains how to build a DCA deployment flow in any Svelte project that integrates with [Raindex](https://raindex.rainlang.xyz/). It is based on the DCA feature in this repository and focuses on reusing the same Rainlang strategy tooling from `@rainlanguage/orderbook`.

## Prerequisites

- A Raindex-compatible backend (Rain Orderbook) configured for your target network.
- The `@rainlanguage/orderbook` package available in your front-end bundle.
- Token metadata for the networks you support (symbol, decimals, vault IDs, Pyth feed IDs if you want automatic price bootstrapping).

## 1. Capture DCA Parameters in the UI

Your UI needs to gather:

- Accumulation direction (buying the asset with stablecoins or selling into stablecoins).
- Budget and cadence (total amount, period, and period unit).
- Baseline price target and initial price ratio for the first execution.
- Minimum/maximum trade sizes per epoch.
- Vault IDs (optional, for reusing existing vault balances).

Below is a simplified extract of the Svelte component that powers the form here. It shows how to normalise user input before dispatching the deployment request:

```svelte
const handleDcaDeploy = () => {
  const normalizeDecimal = (v: string): string => {
    if (!v) return v;
    const n = Number(v);
    if (!Number.isFinite(n)) return v;
    return n
      .toFixed(18)
      .replace(/\.0+$/, '')
      .replace(/\.(.*?)(0+)$/, (m, p1) => (p1 ? `.${p1}`.replace(/\.$/, '') : ''))
      .replace(/\.$/, '');
  };

  const invertAndNormalize = (v: string): string => {
    const n = Number(v || '0');
    if (!Number.isFinite(n) || n === 0) return '0';
    return normalizeDecimal(String(1 / n));
  };

  if (!$connected) {
    showConnectModal = true;
    return;
  }

  const inputTok = orderSide === 'Buy' ? selectedInputToken : selectedOutputToken;
  const outputTok = orderSide === 'Buy' ? selectedOutputToken : selectedInputToken;

  transactionStore.handleDcaDeploy({
    outputToken: outputTok,
    inputToken: inputTok,
    budgetAmount: selectedAmount,
    selectedPeriod,
    selectedPeriodUnit,
    baseline:
      orderSide === 'Buy'
        ? invertAndNormalize(selectedBaseline)
        : normalizeDecimal(selectedBaseline),
    kickoff:
      orderSide === 'Buy'
        ? invertAndNormalize(selectedInitialRatio)
        : normalizeDecimal(selectedInitialRatio),
    minTradeAmount,
    maxTradeAmount,
    inputVaultId,
    outputVaultId,
    depositAmount
  });
};
```

This snippet ensures the Rainlang program receives inverted price ratios for buy-side DCA flows (because the Rain script expects asset/quote ratios) and keeps the sell-side ratios as entered by the user.【F:src/lib/components/orders/DcaStrategy.svelte†L87-L137】

## 2. Derive Deployment Arguments with `DotrainOrderGui`

Use the helper that composes the Rainlang program for the canonical DCA strategy (`auction-dca.rain`). The implementation below fetches the strategy template, binds all user inputs, and derives the calldata Raindex expects:

```ts
export const getDcaDeploymentArgs = async (args: DcaDeploymentArgs) => {
  const dcaStrategy = await (
    await fetch(
      'https://raw.githubusercontent.com/rainlanguage/rain.strategies/6f052d3cc7ccc509e0722f9a6134a17ab56ac629/src/auction-dca.rain'
    )
  ).text();
  const network = get(currentNetwork);
  const gui = (
    await DotrainOrderGui.newWithDeployment(dcaStrategy, network.raindexNetworkSlug)
  ).value as DotrainOrderGui;

  await gui.saveSelectToken('output', args.outputToken.address);
  await gui.saveSelectToken('input', args.inputToken.address);

  const periodInSeconds = getPeriodInSeconds(args.selectedPeriod, args.selectedPeriodUnit);
  gui.saveFieldValue('time-per-amount-epoch', periodInSeconds.toString());
  gui.saveFieldValue('time-per-trade-epoch', '3600');
  gui.saveFieldValue('next-trade-multiplier', '1.01');
  gui.saveFieldValue('next-trade-baseline-multiplier', '0');

  gui.saveFieldValue('amount-per-epoch', formatUnits(args.budgetAmount, args.outputToken.decimals));
  gui.saveFieldValue('max-trade-amount', formatUnits(args.maxTradeAmount, args.outputToken.decimals));
  gui.saveFieldValue('min-trade-amount', formatUnits(args.minTradeAmount, args.outputToken.decimals));
  gui.saveFieldValue('baseline', args.baseline);
  gui.saveFieldValue('initial-io', args.kickoff);
  gui.saveDeposit('output', formatUnits(args.depositAmount, args.outputToken.decimals));

  if (args.inputVaultId) {
    gui.setVaultId(true, 0, args.inputVaultId);
  }
  if (args.outputVaultId) {
    gui.setVaultId(false, 0, args.outputVaultId);
  }

  const $signerAddress = get(signerAddress);
  if (!$signerAddress) throw new Error('Signer address not found');

  const composedRainlangResult = await gui.getComposedRainlang();
  if (composedRainlangResult.error) throw new Error(composedRainlangResult.error.readableMsg);
  const composedRainlang = composedRainlangResult.value;

  const deploymentArgsResult = await gui.getDeploymentTransactionArgs($signerAddress);
  if (deploymentArgsResult.error) throw new Error(deploymentArgsResult.error.readableMsg);
  const deploymentArgs = deploymentArgsResult.value;

  return {
    composedRainlang,
    deploymentArgs
  };
};
```

The resulting `composedRainlang` string and `deploymentArgs` array are all you need to surface a preview modal or to dispatch a transaction through Wagmi or another signer abstraction.【F:src/lib/getDeploymentArgs.ts†L25-L84】

## 3. Trigger the Deployment Flow

Once you have both the user inputs and the Rainlang artefacts, prompt the wallet to review the Rainlang source, then send the transaction to your Raindex contract. This repository delegates the heavy lifting to a transaction store that wraps Wagmi, but any client can reuse the same pattern: fetch strategy -> compose Rainlang -> request confirmation -> submit calldata.【F:src/lib/transactionStore.ts†L229-L240】

## 4. Optional Enhancements

- Pre-fill the initial price ratio using Pyth (or another oracle) whenever the selected asset exposes a price feed ID.【F:src/lib/components/orders/DcaStrategy.svelte†L161-L195】
- Derive average spend per epoch to give users immediate feedback on the cadence of their plan.【F:src/lib/components/orders/DcaStrategy.svelte†L144-L156】
- Persist favourite vault IDs or strategies locally so repeat deployments are faster.

## 5. Testing Your Integration

- Mock `getDcaDeploymentArgs` to ensure your UI feeds the helper the correct arguments and handles errors gracefully.
- Simulate wallet disconnections and ensure you block deployments until a signer is available.
- Run end-to-end tests against a local Raindex instance to verify the Rainlang script executes as expected.

By following these steps you can expose a user-friendly DCA strategy builder in any Raindex-integrated dApp while reusing the canonical Rainlang strategy maintained by the Rain team.
