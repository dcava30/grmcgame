(() => {
  const overlay = document.getElementById('wallet-gate-overlay');
  const connectButton = document.getElementById('connect-wallet-button');
  const statusEl = document.getElementById('wallet-status');
  const errorEl = document.getElementById('wallet-error');
  const loadingEl = document.getElementById('wallet-loading');
  const startButton = document.getElementById('start-game-button');
  const trialButton = document.getElementById('trial-game-button');

  const walletEventTarget = window.__grmcWalletEventTarget || new EventTarget();
  window.__grmcWalletEventTarget = walletEventTarget;

  window.emitWalletEvent = (type, detail = {}) => {
    walletEventTarget.dispatchEvent(new CustomEvent(type, { detail }));
  };

  window.onWalletEvent = (type, handler) => {
    walletEventTarget.addEventListener(type, handler);
    return () => walletEventTarget.removeEventListener(type, handler);
  };

  window.dispatchEvent(new CustomEvent('grmc-wallet-api-ready'));

  const initialState = {
    isHolder: false,
    trialMode: false,
    publicKey: null,
    sessionJwt: null,
    lastBalanceCheck: null,
    chefcoins: 0,
  };

  window.GRMCState = { ...initialState, ...(window.GRMCState || {}) };

  const defaultConfig = {
    mintAddress: '',
    rpcEndpoint: 'https://api.mainnet-beta.solana.com',
    minTokenBalance: 1,
    commitment: 'confirmed',
    autoConnectTrusted: true,
    devWalletAddress: '9Ctm5fCGoLrdXVZAkdKNBZnkf3YF5qD4Ejjdge4cmaWX',
    swapTaxBps: 300,
    minSwapAmount: 1,
  };

  const config = { ...defaultConfig, ...(window.GRMC_GATE_CONFIG || {}) };

  config.devWalletAddress = typeof config.devWalletAddress === 'string' && config.devWalletAddress
    ? config.devWalletAddress
    : defaultConfig.devWalletAddress;
  const parsedSwapBps = Number(config.swapTaxBps);
  config.swapTaxBps = Number.isFinite(parsedSwapBps) ? Math.max(0, Math.floor(parsedSwapBps)) : defaultConfig.swapTaxBps;
  const parsedMinSwap = Number(config.minSwapAmount);
  config.minSwapAmount = Number.isFinite(parsedMinSwap)
    ? Math.max(1, Math.floor(parsedMinSwap))
    : defaultConfig.minSwapAmount;

  function applyStaticState() {
    window.GRMCState.swapTaxBps = config.swapTaxBps;
    window.GRMCState.minSwapAmount = config.minSwapAmount;
    window.GRMCState.devWalletAddress = config.devWalletAddress;
  }

  applyStaticState();
  window.emitWalletEvent('swap-config', {
    swapTaxBps: config.swapTaxBps,
    minSwapAmount: config.minSwapAmount,
    devWalletAddress: config.devWalletAddress,
  });

  let hasVerifiedToken = false;

  let cachedConnection = null;
  let cachedMintKey = null;

  function getConnection() {
    if (!ensureWeb3Ready()) {
      return null;
    }
    if (!cachedConnection) {
      const { Connection } = solanaWeb3;
      cachedConnection = new Connection(config.rpcEndpoint, config.commitment);
    }
    return cachedConnection;
  }

  function getMintPublicKey() {
    if (!ensureWeb3Ready()) {
      return null;
    }
    if (!cachedMintKey) {
      const { PublicKey } = solanaWeb3;
      if (!config.mintAddress) {
        return null;
      }
      cachedMintKey = new PublicKey(config.mintAddress);
    }
    return cachedMintKey;
  }

  function resetCachedConnection() {
    cachedConnection = null;
    cachedMintKey = null;
  }

  window.GRMCWallet = {
    get publicKey() {
      return window.GRMCState?.publicKey || null;
    },
    getConfig() {
      return { ...config };
    },
    getConnection,
    getMintPublicKey,
    async refreshGrmcBalance(options = {}) {
      const emitEvents = options.emitEvents !== false;
      const target = window.GRMCState?.publicKey;
      if (!target) {
        return null;
      }
      return updateGrmcBalance(target, { emitEvents });
    },
    async fetchBalanceFor(publicKeyString, options = {}) {
      if (!publicKeyString) {
        return null;
      }
      const emitEvents = options.emitEvents !== false;
      return updateGrmcBalance(publicKeyString, { emitEvents });
    },
    getCachedBalance() {
      return window.GRMCState?.lastBalanceCheck || null;
    },
  };

  const providerCandidates = () => {
    const list = [];
    if (window.solana) {
      list.push(window.solana);
    }
    if (window.phantom?.solana) {
      list.push(window.phantom.solana);
    }
    if (Array.isArray(window.solanaProviders)) {
      window.solanaProviders.forEach((prov) => {
        if (!list.includes(prov)) {
          list.push(prov);
        }
      });
    }
    return list;
  };

  function pickProvider() {
    const candidates = providerCandidates();
    if (!candidates.length) {
      return null;
    }

    const prioritized = candidates.find((provider) => provider?.isPhantom || provider?.isBackpack || provider?.isSolflare);
    return prioritized || candidates[0];
  }

  let provider = pickProvider();

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
      startButton.disabled = isLoading && !startButton.dataset.ready;
    }
    if (trialButton) {
      trialButton.disabled = isLoading;
    }
  }

  function hideOverlay() {
    overlay.hidden = true;
  }

  function applyAccessStyles() {
    document.body.classList.toggle('holder-mode', Boolean(window.GRMCState.isHolder));
    document.body.classList.toggle('trial-mode', Boolean(window.GRMCState.trialMode));
  }

  function buildMissingTokenMessage() {
    const balanceCheck = window.GRMCState.lastBalanceCheck || {};
    const configuredMinimum = Number(config.minTokenBalance);
    const requiredBalance = Number.isFinite(configuredMinimum) ? configuredMinimum : 1;
    const formattedRequired = requiredBalance.toLocaleString('en-US', { maximumFractionDigits: 6 });

    if (balanceCheck.foundAccounts) {
      const formattedBalance = (balanceCheck.totalBalance || 0).toLocaleString('en-US', {
        maximumFractionDigits: 6,
      });
      return `Your wallet currently holds <strong>${formattedBalance} GRMC</strong>. You need at least <strong>${formattedRequired} GRMC</strong> to unlock the full kitchen. <a href="https://raydium.io/swap/?inputMint=sol&outputMint=6Q7EMLd1BL15TaJ5dmXa2xBoxEU4oj3MLRQd5sCpotuK&referrer=7i5775tjSXaXut3KtahGmFTEuqY6TB3dS2BgDARdRYAd" target="_blank" rel="noreferrer">Buy GRMC on Raydium</a> and reconnect once the transaction settles.`;
    }

    return `We could not find a GRMC balance for this wallet. Confirm you are connected to the Solana mainnet and hold at least <strong>${formattedRequired} GRMC</strong> from the official mint. <a href="https://raydium.io/swap/?inputMint=sol&outputMint=6Q7EMLd1BL15TaJ5dmXa2xBoxEU4oj3MLRQd5sCpotuK&referrer=7i5775tjSXaXut3KtahGmFTEuqY6TB3dS2BgDARdRYAd" target="_blank" rel="noreferrer">Buy GRMC on Raydium</a> and reconnect.`;
  }

  function showPlayReadyState(publicKey) {
    if (!startButton) {
      hideOverlay();
      window.BlockyKitchenGame?.create();
      return;
    }

    startButton.dataset.ready = 'true';
    const detectedBalance = window.GRMCState.lastBalanceCheck?.totalBalance;
    const formattedBalance = Number.isFinite(detectedBalance)
      ? detectedBalance.toLocaleString('en-US', { maximumFractionDigits: 6 })
      : null;
    const confirmationMessage = formattedBalance
      ? `Detected ${formattedBalance} GRMC. Holders unlock full access, boosts, and tournaments.`
      : 'GRMC verified! Holders unlock full access, boosts, and tournaments.';

    setStatus(confirmationMessage);
    startButton.hidden = false;
    startButton.disabled = false;
    connectButton.hidden = true;
    toggleLoading(false);
    window.GRMCState.isHolder = true;
    window.GRMCState.trialMode = false;
    window.GRMCState.publicKey = publicKey || window.GRMCState.publicKey;
    applyAccessStyles();
    if (formattedBalance) {
      window.emitWalletEvent('balance-update', {
        totalBalance: detectedBalance,
        formattedBalance,
      });
    }
    window.emitWalletEvent('access-update', { isHolder: true, trialMode: false, publicKey: window.GRMCState.publicKey });
    window.emitWalletEvent('connected', { publicKey: window.GRMCState.publicKey, isHolder: true });
    if (typeof startButton.focus === 'function') {
      try {
        startButton.focus({ preventScroll: true });
      } catch (err) {
        startButton.focus();
      }
    }
  }

  function resetGateMessaging() {
    hasVerifiedToken = false;
    setStatus('A GRMC balance check is required before full access begins.');
    showError('');
    toggleLoading(false);
    connectButton.hidden = false;
    connectButton.disabled = false;
    if (startButton) {
      startButton.hidden = true;
      startButton.disabled = true;
      delete startButton.dataset.ready;
    }
    if (trialButton) {
      trialButton.hidden = false;
      trialButton.disabled = false;
    }
    delete window.GRMCState.lastBalanceCheck;
  }

  function ensureConfigValid() {
    if (!config.mintAddress || config.mintAddress.includes('REPLACE_WITH_GRMC_MINT_ADDRESS')) {
      showError('Configure window.GRMC_GATE_CONFIG.mintAddress with your GRMC token mint before going live.');
      connectButton.disabled = true;
      return false;
    }
    return true;
  }

  async function establishSession(publicKey) {
    if (!config.apiBase) {
      return null;
    }

    try {
      const nonceResponse = await fetch(`${config.apiBase}/auth/nonce`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ publicKey }),
      });
      if (!nonceResponse.ok) {
        return null;
      }
      const { nonce } = await nonceResponse.json();
      if (!nonce || typeof provider?.signMessage !== 'function') {
        return null;
      }

      const encoded = new TextEncoder().encode(nonce);
      const signed = await provider.signMessage(encoded, 'utf8');
      const verifyResponse = await fetch(`${config.apiBase}/auth/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ publicKey, signature: Array.from(signed?.signature || signed || []) }),
      });
      if (!verifyResponse.ok) {
        return null;
      }
      const payload = await verifyResponse.json();
      if (payload?.token) {
        window.GRMCState.sessionJwt = payload.token;
        window.emitWalletEvent('session', { token: payload.token, publicKey });
        return payload.token;
      }
    } catch (error) {
      console.warn('[GRMC Gate] Unable to establish API session:', error);
    }

    return null;
  }

  async function connectWallet() {
    showError('');

    if (!ensureConfigValid()) {
      return;
    }

    provider = pickProvider();
    if (!provider) {
      showError('No Solana wallet detected. Please install Phantom or another compatible wallet.');
      return;
    }

    try {
      toggleLoading(true);
      setStatus('Requesting wallet connection…');
      const publicKey = await ensureWalletConnection({ onlyIfTrusted: false });

      setStatus('Connected. Checking GRMC balance…');
      const holdsToken = await verifyGatedToken(publicKey);

      if (!holdsToken) {
        toggleLoading(false);
        showError(buildMissingTokenMessage());
        window.GRMCState.isHolder = false;
        window.GRMCState.publicKey = publicKey;
        window.emitWalletEvent('connected', { publicKey, isHolder: false });
        applyAccessStyles();
        return;
      }

      hasVerifiedToken = true;
      window.GRMCState.publicKey = publicKey;
      await establishSession(publicKey);
      showPlayReadyState(publicKey);
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

  async function ensureWalletConnection({ onlyIfTrusted } = {}) {
    if (!provider) {
      throw new Error('No Solana wallet detected.');
    }

    if (provider.isConnected && provider.publicKey) {
      return provider.publicKey.toString();
    }

    const response = await provider.connect({ onlyIfTrusted });
    const publicKey = response?.publicKey || provider.publicKey;
    const publicKeyString = publicKey?.toString?.();

    if (!publicKeyString) {
      throw new Error('Wallet connection failed.');
    }

    return publicKeyString;
  }

  function ensureWeb3Ready() {
    if (typeof solanaWeb3 === 'undefined') {
      showError('Solana web3 library failed to load. Check your network connection and try again.');
      return false;
    }
    return true;
  }

  async function updateGrmcBalance(publicKeyString, { emitEvents = true } = {}) {
    try {
      if (!ensureWeb3Ready()) {
        return {
          totalBalance: 0,
          foundAccounts: false,
          meetsRequirement: false,
        };
      }

      const connection = getConnection();
      if (!connection) {
        throw new Error('Solana RPC unavailable');
      }

      const { PublicKey } = solanaWeb3;
      const owner = new PublicKey(publicKeyString);
      const mintKey = getMintPublicKey();
      if (!mintKey) {
        throw new Error('GRMC mint not configured');
      }

      const configuredMinimum = Number(config.minTokenBalance);
      const minimumBalance = Number.isFinite(configuredMinimum) ? configuredMinimum : 1;

      const legacyTokenProgramId = new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');
      const token2022ProgramId = new PublicKey('TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb');

      const matchesMint = (parsedAccount) => {
        const mint = parsedAccount?.account?.data?.parsed?.info?.mint;
        return typeof mint === 'string' && mint === mintKey.toBase58();
      };

      const parseBalance = (parsedAccount) => {
        const amountInfo = parsedAccount?.account?.data?.parsed?.info?.tokenAmount;
        if (!amountInfo) {
          return 0;
        }

        if (typeof amountInfo.uiAmount === 'number') {
          return amountInfo.uiAmount;
        }

        const rawAmount = parseFloat(amountInfo.amount);
        const decimals = Number(amountInfo.decimals) || 0;
        if (Number.isFinite(rawAmount)) {
          return rawAmount / Math.pow(10, decimals);
        }

        return 0;
      };

      const directResponse = await connection.getParsedTokenAccountsByOwner(owner, { mint: mintKey });
      let matchingAccounts = Array.isArray(directResponse?.value)
        ? directResponse.value.filter(matchesMint)
        : [];

      if (!matchingAccounts.length) {
        const programResults = await Promise.allSettled([
          connection.getParsedTokenAccountsByOwner(owner, { programId: legacyTokenProgramId }),
          connection.getParsedTokenAccountsByOwner(owner, { programId: token2022ProgramId }),
        ]);

        matchingAccounts = programResults
          .filter((result) => result.status === 'fulfilled')
          .flatMap((result) => (result.value?.value || []).filter(matchesMint));
      }

      const totalBalance = matchingAccounts.reduce((sum, account) => sum + parseBalance(account), 0);
      const meetsRequirement = totalBalance >= minimumBalance;

      const state = {
        totalBalance,
        foundAccounts: matchingAccounts.length > 0,
        meetsRequirement,
        timestamp: Date.now(),
        accountCount: matchingAccounts.length,
      };

      window.GRMCState.lastBalanceCheck = state;

      if (emitEvents) {
        const formattedBalance = totalBalance.toLocaleString('en-US', { maximumFractionDigits: 6 });
        window.emitWalletEvent('balance-update', {
          totalBalance,
          formattedBalance,
          meetsRequirement,
          source: 'grmc',
        });
        window.emitWalletEvent('grmc-balance', {
          totalBalance,
          meetsRequirement,
          accountCount: matchingAccounts.length,
        });
      }

      return state;
    } catch (error) {
      console.error('[GRMC Gate] Balance check failed:', error);
      const state = {
        totalBalance: 0,
        foundAccounts: false,
        meetsRequirement: false,
        timestamp: Date.now(),
        error: error?.message || 'Unknown error',
      };
      window.GRMCState.lastBalanceCheck = state;
      if (emitEvents) {
        window.emitWalletEvent('balance-update', {
          totalBalance: 0,
          formattedBalance: '0',
          meetsRequirement: false,
          source: 'grmc',
          error: error?.message || 'Unknown error',
        });
      }
      return state;
    }
  }

  async function verifyGatedToken(publicKeyString) {
    const result = await updateGrmcBalance(publicKeyString, { emitEvents: true });
    if (result.error) {
      showError('Unable to verify GRMC holdings right now. Please try again later.');
    }
    return result.meetsRequirement;
  }

  function handleWalletEvents() {
    provider = pickProvider();
    if (!provider) {
      return;
    }

    provider.on?.('accountChanged', () => {
      window.GRMCState.isHolder = false;
      window.GRMCState.sessionJwt = null;
      window.GRMCState.chefcoins = 0;
      applyAccessStyles();
      window.emitWalletEvent('access-update', { isHolder: false, trialMode: window.GRMCState.trialMode });
      window.emitWalletEvent('chefcoins-update', { chefcoins: 0 });
      if (!overlay.hidden) {
        resetGateMessaging();
        setStatus('Wallet account changed. Please reconnect.');
      } else {
        // Force revalidation if overlay is already hidden
        overlay.hidden = false;
        resetGateMessaging();
        setStatus('Wallet changed. Please reconnect to continue.');
      }
      resetCachedConnection();
    });

    provider.on?.('disconnect', () => {
      overlay.hidden = false;
      setStatus('Wallet disconnected. Reconnect to keep playing.');
      resetGateMessaging();
      window.GRMCState = { ...initialState };
      applyStaticState();
      applyAccessStyles();
      window.emitWalletEvent('disconnected', {});
      window.emitWalletEvent('chefcoins-update', { chefcoins: 0 });
      window.emitWalletEvent('grmc-balance', { totalBalance: 0, meetsRequirement: false, accountCount: 0 });
    });
  }

  document.addEventListener('DOMContentLoaded', () => {
    resetGateMessaging();
    handleWalletEvents();
    provider = pickProvider();

    if (config.autoConnectTrusted === false) {
      return;
    }

    if (!provider) {
      return;
    }

    setTimeout(async () => {
      try {
        toggleLoading(true);
        setStatus('Checking for an approved wallet…');
        const publicKey = await ensureWalletConnection({ onlyIfTrusted: true });
        if (!publicKey) {
          toggleLoading(false);
          resetGateMessaging();
          return;
        }

        setStatus('Approved wallet detected. Verifying GRMC balance…');
        const holdsToken = await verifyGatedToken(publicKey);
        if (holdsToken) {
          hasVerifiedToken = true;
          window.GRMCState.publicKey = publicKey;
          await establishSession(publicKey);
          showPlayReadyState(publicKey);
        } else {
          resetGateMessaging();
          showError(buildMissingTokenMessage());
        }
      } catch (error) {
        if (error?.code === 4001 || /User rejected/i.test(error?.message || '')) {
          resetGateMessaging();
        } else {
          console.warn('[GRMC Gate] Trusted autoconnect failed:', error);
          showError('Unable to check your wallet automatically. Please press “Connect Wallet” to continue.');
        }
      } finally {
        toggleLoading(false);
      }
    }, 150);
  });

  connectButton.addEventListener('click', connectWallet);
  function startFullAccess() {
    if (!hasVerifiedToken) {
      showError('Please connect a GRMC-holding wallet before starting the game.');
      return;
    }
    window.GRMCState.trialMode = false;
    window.GRMCState.isHolder = true;
    applyAccessStyles();
    window.emitWalletEvent('access-update', { isHolder: true, trialMode: false, publicKey: window.GRMCState.publicKey });
    hideOverlay();
    window.BlockyKitchenGame?.create();
  }

  function startTrial() {
    window.GRMCState.trialMode = true;
    window.GRMCState.isHolder = false;
    window.GRMCState.sessionJwt = null;
    applyAccessStyles();
    window.emitWalletEvent('access-update', { isHolder: false, trialMode: true });
    window.emitWalletEvent('trial-started', { trialMode: true });
    hideOverlay();
    window.BlockyKitchenGame?.create();
  }

  startButton?.addEventListener('click', startFullAccess);
  trialButton?.addEventListener('click', startTrial);
})();
