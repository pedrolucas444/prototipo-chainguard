/**
 * Wallet Connector: fala com a carteira do usuário via EIP-1193.
 *  - MetaMask (ou outra carteira injetada em window.ethereum)
 *  - WalletConnect (opcional; exige WALLETCONNECT_PROJECT_ID no servidor)
 * O ChainGuard nunca vê a chave privada: só pede à carteira que assine e transmita.
 */
const MAINNET = "0x1";
const TRANSFER_SELECTOR = "0xa9059cbb"; // transfer(address,uint256)

/** Converte "1,5" / "1.5" em unidades inteiras sem perder precisão (BigInt). */
export function parseUnits(amount, decimals) {
  const text = String(amount).trim().replace(",", ".");
  if (!/^\d+(\.\d+)?$/.test(text)) throw new Error("Valor inválido.");
  const [whole, fraction = ""] = text.split(".");
  if (fraction.length > decimals) throw new Error(`Use no máximo ${decimals} casas decimais.`);
  return BigInt(whole) * 10n ** BigInt(decimals) + BigInt(fraction.padEnd(decimals, "0") || "0");
}

const pad32 = hex => hex.replace(/^0x/, "").padStart(64, "0");

export function createWalletConnector({ walletConnectProjectId } = {}) {
  let provider = null;
  let account = null;
  let kind = null;
  const listeners = new Set();
  const emit = () => listeners.forEach(fn => fn({ account, kind }));

  async function ensureMainnet() {
    const chainId = await provider.request({ method: "eth_chainId" });
    if (chainId === MAINNET) return;
    try {
      await provider.request({ method: "wallet_switchEthereumChain", params: [{ chainId: MAINNET }] });
    } catch {
      throw new Error("A carteira está em outra rede. Mude para Ethereum Mainnet e tente de novo.");
    }
  }

  return {
    get account() { return account; },
    get kind() { return kind; },
    hasInjected: () => typeof window !== "undefined" && Boolean(window.ethereum),
    walletConnectAvailable: () => Boolean(walletConnectProjectId),
    onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); },

    async connect(type = "injected") {
      if (type === "injected") {
        if (!window.ethereum) throw new Error("Nenhuma carteira encontrada no navegador. Instale a MetaMask ou use WalletConnect.");
        provider = window.ethereum;
      } else {
        if (!walletConnectProjectId) throw new Error("WalletConnect não configurado no servidor.");
        const { EthereumProvider } = await import("https://esm.sh/@walletconnect/ethereum-provider@2.17.0");
        provider = await EthereumProvider.init({ projectId: walletConnectProjectId, chains: [1], showQrModal: true, methods: ["eth_sendTransaction", "eth_chainId"], metadata: { name: "ChainGuard", description: "Monitoramento de risco Ethereum", url: location.origin, icons: [] } });
        await provider.connect();
      }
      const accounts = await provider.request({ method: "eth_requestAccounts" });
      if (!accounts?.length) throw new Error("Nenhuma conta autorizada na carteira.");
      account = accounts[0].toLowerCase();
      kind = type;
      await ensureMainnet();
      provider.on?.("accountsChanged", list => { account = list?.[0]?.toLowerCase() ?? null; emit(); });
      provider.on?.("disconnect", () => { account = null; emit(); });
      emit();
      return account;
    },

    async disconnect() {
      if (kind === "walletconnect") await provider?.disconnect?.().catch(() => {});
      provider = null;
      account = null;
      kind = null;
      emit();
    },

    /**
     * Pede à carteira que assine e transmita. Para tokens ERC-20, monta a chamada transfer().
     * Retorna o hash da transação.
     */
    async send({ to, amount, asset }) {
      if (!provider || !account) throw new Error("Conecte a carteira primeiro.");
      await ensureMainnet();
      let tx;
      if (asset.symbol === "ETH") {
        tx = { from: account, to, value: `0x${parseUnits(amount, 18).toString(16)}` };
      } else {
        if (!asset.contract_address) throw new Error("Contrato do token não cadastrado.");
        const units = parseUnits(amount, asset.decimals);
        tx = { from: account, to: asset.contract_address, value: "0x0", data: `${TRANSFER_SELECTOR}${pad32(to)}${pad32(units.toString(16))}` };
      }
      return provider.request({ method: "eth_sendTransaction", params: [tx] });
    },
  };
}
