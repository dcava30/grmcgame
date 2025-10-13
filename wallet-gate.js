(() => {
  const overlay = document.getElementById('wallet-gate-overlay');
  const connectButton = document.getElementById('connect-wallet-button');
  const statusEl = document.getElementById('wallet-status');
  const errorEl = document.getElementById('wallet-error');
  const loadingEl = document.getElementById('wallet-loading');
  const startButton = document.getElementById('start-game-button');

  const defaultConfig = {
    mintAddress: '',
    rpcEndpoint: 'https://api.mainnet-beta.solana.com',
    minTokenBalance: 1,
    commitment: 'confirmed',
  };

  const config = { ...defaultConfig, ...(window.GRMC_GATE_CONFIG || {}) };

  if (!overlay || !connectButton) {
    console.warn('[GRMC Gate] Overlay elements missing.');
    return;
  }

  function setStatus(message) {
    statusEl.textContent = message || '';
  }

  function showError(message) {
    if (!message) {
      errorEl.hidden = true;
      errorEl.innerHTML = '';
      return;
    }
    errorEl.hidden = false;
    errorEl.innerHTML = message;
  }

  function toggleLoading(isLoading) {
    loadingEl.hidden = !isLoading;
    connectButton.disabled = isLoading;
    if (startButton) {
      startButton.disabled = isLoading;
    }
  }

  function hideOverlay() {
    overlay.hidden = true;
  }

  function showPlayReadyState() {
    if (!startButton) {
      hideOverlay();
      window.BlockyKitchenGame?.create();
      return;
    }

    setStatus('GRMC verified! Click “Play Gordon\'s Blocky Kitchen” to enter the service.');
    startButton.hidden = false;
    startButton.disabled = false;
    connectButton.hidden = true;
    toggleLoading(false);
    if (typeof startButton.focus === 'function') {
      try {
        startButton.focus({ preventScroll: true });
      } catch (err) {
        startButton.focus();
      }
    }
  }

  function resetGateMessaging() {
    setStatus('A GRMC balance check is required before service begins.');
    showError('');
    toggleLoading(false);
    connectButton.hidden = false;
    connectButton.disabled = false;
    if (startButton) {
      startButton.hidden = true;
      startButton.disabled = false;
    }
  }

  function ensureConfigValid() {
    if (!config.mintAddress || config.mintAddress.includes('REPLACE_WITH_GRMC_MINT_ADDRESS')) {
      showError('Configure window.GRMC_GATE_CONFIG.mintAddress with your GRMC token mint before going live.');
      connectButton.disabled = true;
      return false;
    }
    return true;
  }

  async function connectWallet() {
    showError('');

    if (!ensureConfigValid()) {
      return;
    }

    const provider = window.solana;
    if (!provider) {
      showError('No Solana wallet detected. Please install Phantom or another compatible wallet.');
      return;
    }

    try {
      toggleLoading(true);
      setStatus('Requesting wallet connection…');
      const response = await provider.connect();
      const publicKey = response?.publicKey?.toString?.();

      if (!publicKey) {
        throw new Error('Wallet connection failed.');
      }

      setStatus('Connected. Checking GRMC balance…');
      const holdsToken = await verifyGatedToken(publicKey);

      if (!holdsToken) {
        toggleLoading(false);
        showError(
          'No GRMC detected in this wallet. <a href="https://raydium.io/swap/?inputMint=sol&outputMint=6Q7EMLd1BL15TaJ5dmXa2xBoxEU4oj3MLRQd5sCpotuK&referrer=7i5775tjSXaXut3KtahGmFTEuqY6TB3dS2BgDARdRYAd" target="_blank" rel="noreferrer">Buy GRMC on Raydium</a> and reconnect.'
        );
        return;
      }

      showPlayReadyState();
    } catch (error) {
      console.error('[GRMC Gate] Wallet connection error:', error);
      if (error?.code === 4001) {
        showError('Wallet request was rejected. Approve the connection to enter the kitchen.');
      } else {
        showError(error?.message || 'Wallet connection failed. Please try again.');
      }
    } finally {
      toggleLoading(false);
    }
  }

  async function verifyGatedToken(publicKeyString) {
    try {
      const { Connection, PublicKey } = solanaWeb3;
      const connection = new Connection(config.rpcEndpoint, config.commitment);
      const owner = new PublicKey(publicKeyString);
      const mintKey = new PublicKey(config.mintAddress);
      const tokenAccounts = await connection.getParsedTokenAccountsByOwner(owner, { mint: mintKey });

      if (!tokenAccounts?.value?.length) {
        return false;
      }

      return tokenAccounts.value.some((account) => {
        const amountInfo = account?.account?.data?.parsed?.info?.tokenAmount;
        if (!amountInfo) {
          return false;
        }
        const balance = amountInfo.uiAmount || parseFloat(amountInfo.amount) / Math.pow(10, amountInfo.decimals || 0);
        return balance >= config.minTokenBalance;
      });
    } catch (error) {
      console.error('[GRMC Gate] Balance check failed:', error);
      showError('Unable to verify GRMC holdings right now. Please try again later.');
      return false;
    }
  }

  function handleWalletEvents() {
    const provider = window.solana;
    if (!provider) {
      return;
    }

    provider.on?.('accountChanged', () => {
      if (!overlay.hidden) {
        resetGateMessaging();
        setStatus('Wallet account changed. Please reconnect.');
      } else {
        // Force revalidation if overlay is already hidden
        overlay.hidden = false;
        resetGateMessaging();
        setStatus('Wallet changed. Please reconnect to continue.');
      }
    });

    provider.on?.('disconnect', () => {
      overlay.hidden = false;
      setStatus('Wallet disconnected. Reconnect to keep playing.');
      resetGateMessaging();
    });
  }

  document.addEventListener('DOMContentLoaded', () => {
    resetGateMessaging();
    handleWalletEvents();
  });

  connectButton.addEventListener('click', connectWallet);
  startButton?.addEventListener('click', () => {
    hideOverlay();
    window.BlockyKitchenGame?.create();
  });
})();
