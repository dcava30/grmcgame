(() => {
  const overlay = document.getElementById('wallet-gate-overlay');
  const connectButton = document.getElementById('connect-wallet-button');
  const statusEl = document.getElementById('wallet-status');
  const errorEl = document.getElementById('wallet-error');
  const loadingEl = document.getElementById('wallet-loading');
  const startButton = document.getElementById('start-game-button');
  const trialButton = document.getElementById('trial-game-button');
  const clusterIndicator = document.getElementById('wallet-cluster-indicator');
  const demoCheckbox = document.getElementById('wallet-demo-checkbox');
  const devSettingsPanel = document.getElementById('wallet-dev-settings');
  const clusterSelect = document.getElementById('wallet-cluster-select');
  const rpcInput = document.getElementById('wallet-rpc-input');
  const rpcSaveButton = document.getElementById('wallet-save-rpc');
  const rpcResetButton = document.getElementById('wallet-reset-rpc');

  const startButtonDefaultLabel = startButton?.textContent?.trim?.() || 'Enter Full Kitchen';

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
    restrictedAccess: false,
    publicKey: null,
    sessionJwt: null,
    lastBalanceCheck: null,
    chefcoins: 0,
    diagnostics: null,
    onchainGrmc: 0,
    onchainGrmcRaw: '0',
    devBypass: false,
  };

  window.GRMCState = { ...initialState, ...(window.GRMCState || {}) };

  const STORAGE_KEYS = {
    cluster: 'GRMC_SOL_CLUSTER',
    rpcEndpoint: 'GRMC_RPC_ENDPOINT',
  };

  const defaultConfig = {
    mintAddress: '',
    rpcEndpoint: 'https://api.mainnet-beta.solana.com',
    cluster: 'mainnet-beta',
    minTokenBalance: 1,
    commitment: 'confirmed',
    autoConnectTrusted: true,
    devWalletAddress: '9Ctm5fCGoLrdXVZAkdKNBZnkf3YF5qD4Ejjdge4cmaWX',
    swapTaxBps: 300,
    minSwapAmount: 1,
    devBypass: false,
  };

  const config = { ...defaultConfig, ...(window.GRMC_GATE_CONFIG || {}) };

  config.rpcEndpoint = typeof config.rpcEndpoint === 'string' && config.rpcEndpoint.trim()
    ? config.rpcEndpoint.trim()
    : defaultConfig.rpcEndpoint;
  config.devWalletAddress = typeof config.devWalletAddress === 'string' && config.devWalletAddress
    ? config.devWalletAddress
    : defaultConfig.devWalletAddress;
  const normalizedCluster = typeof config.cluster === 'string' && config.cluster.trim()
    ? config.cluster.trim()
    : inferClusterFromEndpoint(config.rpcEndpoint);
  config.cluster = normalizedCluster;
  config.devBypass = Boolean(config.devBypass);
  const parsedSwapBps = Number(config.swapTaxBps);
  config.swapTaxBps = Number.isFinite(parsedSwapBps) ? Math.max(0, Math.floor(parsedSwapBps)) : defaultConfig.swapTaxBps;
  const parsedMinSwap = Number(config.minSwapAmount);
  config.minSwapAmount = Number.isFinite(parsedMinSwap)
    ? Math.max(1, Math.floor(parsedMinSwap))
    : defaultConfig.minSwapAmount;

  const TOKEN_PROGRAM_IDS = {
    legacy: 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA',
    token2022: 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb',
  };

  const DEMO_PUBLIC_KEY = 'DemoWallet1111111111111111111111111111111111';
  const DEMO_BALANCE = 1_000_000;
  const DEMO_CHEFCOINS = 250_000;

  function applyStaticState() {
    window.GRMCState.swapTaxBps = config.swapTaxBps;
    window.GRMCState.minSwapAmount = config.minSwapAmount;
    window.GRMCState.devWalletAddress = config.devWalletAddress;
    window.GRMCState.cluster = config.cluster;
    window.GRMCState.rpcEndpoint = config.rpcEndpoint;
    window.GRMCState.devBypass = Boolean(config.devBypass);
    window.GRMCState.restrictedAccess = Boolean(window.GRMCState.restrictedAccess);
  }

  applyStaticState();
  updateClusterIndicator();
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

  function inferClusterFromEndpoint(endpoint) {
    if (!endpoint || typeof endpoint !== 'string') {
      return defaultConfig.cluster;
    }
    const normalized = endpoint.toLowerCase();
    if (normalized.includes('devnet')) {
      return 'devnet';
    }
    if (normalized.includes('testnet')) {
      return 'testnet';
    }
    if (normalized.includes('localhost') || normalized.includes('127.0.0.1')) {
      return 'localnet';
    }
    return 'mainnet-beta';
  }

  function updateClusterIndicator() {
    if (!clusterIndicator) {
      return;
    }
    const clusterLabel = window.GRMCState?.cluster || config.cluster || inferClusterFromEndpoint(config.rpcEndpoint);
    const text = clusterLabel ? `Cluster: ${clusterLabel}` : '';
    clusterIndicator.textContent = text;
    clusterIndicator.hidden = !text;
  }

  function setupDevControls() {
    if (typeof window === 'undefined' || typeof localStorage === 'undefined') {
      return;
    }
    if (demoCheckbox) {
      demoCheckbox.checked = Boolean(config.devBypass);
      demoCheckbox.addEventListener('change', () => {
        const url = new URL(window.location.href);
        if (demoCheckbox.checked) {
          url.searchParams.set('demo', '1');
        } else {
          url.searchParams.delete('demo');
          url.searchParams.delete('demoMode');
        }
        window.location.href = url.toString();
      });
    }

    if (clusterSelect) {
      const desiredCluster = config.cluster || inferClusterFromEndpoint(config.rpcEndpoint);
      const options = Array.from(clusterSelect.options || []);
      if (!options.some((option) => option.value === desiredCluster)) {
        const option = document.createElement('option');
        option.value = desiredCluster;
        option.textContent = desiredCluster;
        clusterSelect.appendChild(option);
      }
      clusterSelect.value = desiredCluster;
      clusterSelect.addEventListener('change', (event) => {
        const value = event.target.value;
        try {
          if (value === 'custom') {
            const current = localStorage.getItem(STORAGE_KEYS.cluster) || desiredCluster;
            const manual = window.prompt('Enter custom cluster label', current || 'mainnet-beta');
            if (manual && manual.trim()) {
              const trimmed = manual.trim();
              localStorage.setItem(STORAGE_KEYS.cluster, trimmed);
              localStorage.setItem('SOL_CLUSTER', trimmed);
            } else {
              localStorage.removeItem(STORAGE_KEYS.cluster);
              localStorage.removeItem('SOL_CLUSTER');
            }
          } else {
            localStorage.setItem(STORAGE_KEYS.cluster, value);
            localStorage.setItem('SOL_CLUSTER', value);
          }
        } catch (error) {
          console.warn('[GRMC Gate] Unable to persist cluster selection:', error);
        }
        window.location.reload();
      });
    }

    if (rpcInput) {
      rpcInput.value = config.rpcEndpoint || '';
    }

    if (rpcSaveButton) {
      rpcSaveButton.addEventListener('click', () => {
        const value = (rpcInput?.value || '').trim();
        try {
          if (value) {
            localStorage.setItem(STORAGE_KEYS.rpcEndpoint, value);
            localStorage.setItem('RPC_ENDPOINT', value);
          } else {
            localStorage.removeItem(STORAGE_KEYS.rpcEndpoint);
            localStorage.removeItem('RPC_ENDPOINT');
          }
        } catch (error) {
          console.warn('[GRMC Gate] Unable to persist RPC endpoint:', error);
        }
        window.location.reload();
      });
    }

    if (rpcResetButton) {
      rpcResetButton.addEventListener('click', () => {
        try {
          localStorage.removeItem(STORAGE_KEYS.rpcEndpoint);
          localStorage.removeItem('RPC_ENDPOINT');
          localStorage.removeItem(STORAGE_KEYS.cluster);
          localStorage.removeItem('SOL_CLUSTER');
        } catch (error) {
          console.warn('[GRMC Gate] Unable to clear RPC endpoint overrides:', error);
        }
        window.location.reload();
      });
    }
  }

  function escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function safeBigInt(value) {
    try {
      if (typeof value === 'bigint') {
        return value;
      }
      if (typeof value === 'number' && Number.isFinite(value)) {
        return BigInt(Math.trunc(value));
      }
      const normalized = typeof value === 'string' ? value : String(value ?? '0');
      if (!normalized) {
        return 0n;
      }
      return BigInt(normalized);
    } catch (error) {
      console.warn('[GRMC Gate] Unable to parse token amount as BigInt:', error);
      return 0n;
    }
  }

  function rawToNumber(rawValue, decimals) {
    if (typeof decimals !== 'number' || decimals < 0) {
      return Number(rawValue);
    }
    if (rawValue === 0n) {
      return 0;
    }
    const rawString = rawValue.toString();
    if (!decimals) {
      return Number(rawString);
    }
    const isNegative = rawString.startsWith('-');
    const digits = isNegative ? rawString.slice(1) : rawString;
    const padded = digits.padStart(decimals + 1, '0');
    const whole = padded.slice(0, padded.length - decimals) || '0';
    const fraction = padded.slice(padded.length - decimals).replace(/0+$/, '');
    const formatted = fraction ? `${whole}.${fraction}` : whole;
    return Number(isNegative ? `-${formatted}` : formatted);
  }

  async function fetchMintDecimals(connection, mintKey) {
    try {
      const mintInfo = await connection.getParsedAccountInfo(mintKey);
      const decimals = mintInfo?.value?.data?.parsed?.info?.decimals;
      if (typeof decimals === 'number') {
        return decimals;
      }
    } catch (error) {
      console.warn('[GRMC Gate] Unable to fetch mint decimals:', error);
    }
    return 9;
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

  overlay.style.pointerEvents = 'auto';
  overlay.classList.remove('wallet-gate--hidden');
  overlay.removeAttribute('aria-hidden');

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
    if (!overlay) {
      return;
    }
    overlay.hidden = true;
    overlay.setAttribute('aria-hidden', 'true');
    overlay.classList.add('wallet-gate--hidden');
    overlay.style.pointerEvents = 'none';
  }

  function launchGameScene({ directGame = false } = {}) {
    hideOverlay();
    const createInstance = window.BlockyKitchenGame?.create;
    if (typeof createInstance !== 'function') {
      console.warn('[GRMC Gate] Game instance factory not ready.');
      return;
    }
    const instance = createInstance();
    if (!instance?.scene) {
      console.warn('[GRMC Gate] Game scene manager unavailable.');
      return;
    }
    const preferGame = directGame && instance.scene.keys?.GameScene;
    const targetScene = preferGame
      ? 'GameScene'
      : instance.scene.keys?.TitleScene
        ? 'TitleScene'
        : instance.scene.keys?.BootScene
          ? 'BootScene'
          : null;
    if (!targetScene) {
      console.warn('[GRMC Gate] Unable to determine target scene.');
      return;
    }
    setTimeout(() => {
      try {
        if (typeof window.hideBootSpinner === 'function') {
          window.hideBootSpinner('walletGate');
        }
        instance.scene.start(targetScene);
      } catch (error) {
        console.error('[GRMC Gate] Failed to start Phaser scene:', error);
        if (typeof window.showFatalError === 'function') {
          window.showFatalError(error);
        }
      }
    }, 0);
  }

  function launchGameScene({ directGame = false } = {}) {
    hideOverlay();
    const createInstance = window.BlockyKitchenGame?.create;
    if (typeof createInstance !== 'function') {
      console.warn('[GRMC Gate] Game instance factory not ready.');
      return;
    }
    const instance = createInstance();
    if (!instance?.scene) {
      console.warn('[GRMC Gate] Game scene manager unavailable.');
      return;
    }
    const preferGame = directGame && instance.scene.keys?.GameScene;
    const targetScene = preferGame
      ? 'GameScene'
      : instance.scene.keys?.TitleScene
        ? 'TitleScene'
        : instance.scene.keys?.BootScene
          ? 'BootScene'
          : null;
    if (!targetScene) {
      console.warn('[GRMC Gate] Unable to determine target scene.');
      return;
    }
    setTimeout(() => {
      try {
        instance.scene.start(targetScene);
      } catch (error) {
        console.error('[GRMC Gate] Failed to start Phaser scene:', error);
      }
    }, 0);
  }

  function applyAccessStyles() {
    document.body.classList.toggle('holder-mode', Boolean(window.GRMCState.isHolder));
    document.body.classList.toggle('trial-mode', Boolean(window.GRMCState.trialMode));
    document.body.classList.toggle('restricted-mode', Boolean(window.GRMCState.restrictedAccess));
    document.body.classList.toggle('demo-mode', Boolean(window.GRMCState.devBypass));
  }

  function buildMissingTokenMessage() {
    const balanceCheck = window.GRMCState.lastBalanceCheck || {};
    const configuredMinimum = Number(config.minTokenBalance);
    const requiredBalance = Number.isFinite(configuredMinimum) ? configuredMinimum : 1;
    const formattedRequired = requiredBalance.toLocaleString('en-US', { maximumFractionDigits: 6 });
    const diagnostics = window.GRMCState.diagnostics || {};
    const clusterLabel = diagnostics.cluster || config.cluster || inferClusterFromEndpoint(config.rpcEndpoint);
    const safeCluster = clusterLabel ? escapeHtml(clusterLabel) : '';
    const mintLabel = config.mintAddress ? escapeHtml(config.mintAddress) : '';
    const rpcLabel = diagnostics.rpcEndpoint || config.rpcEndpoint || '';

    const diagnosticsBits = [];
    if (safeCluster) {
      diagnosticsBits.push(`Cluster checked: <strong>${safeCluster}</strong>`);
    }
    if (rpcLabel) {
      diagnosticsBits.push(`RPC: <code>${escapeHtml(rpcLabel)}</code>`);
    }
    if (diagnostics.programUsed && diagnostics.programUsed !== 'none') {
      diagnosticsBits.push(`Program: <code>${escapeHtml(diagnostics.programUsed)}</code>`);
    }
    if (diagnostics.legacyError || diagnostics.token2022Error || diagnostics.error) {
      const hint = diagnostics.legacyError || diagnostics.token2022Error || diagnostics.error;
      diagnosticsBits.push(`Last RPC hint: <code>${escapeHtml(hint)}</code>`);
    }

    const diagnosticsHint = diagnosticsBits.length ? `<br/><small>${diagnosticsBits.join(' · ')}</small>` : '';

    if (balanceCheck.foundAccounts) {
      const formattedBalance = (balanceCheck.totalBalance || 0).toLocaleString('en-US', {
        maximumFractionDigits: 6,
      });
      return `Your wallet currently holds <strong>${formattedBalance} GRMC</strong>. You need at least <strong>${formattedRequired} GRMC</strong> to unlock the full kitchen.${diagnosticsHint}`;
    }

    const mintDescriptor = mintLabel ? `the configured mint <code>${mintLabel}</code>` : 'the configured GRMC mint';
    const clusterDescriptor = safeCluster ? `<strong>${safeCluster}</strong>` : 'the correct Solana cluster';

    return `We could not locate a GRMC balance for this wallet on ${mintDescriptor}. Confirm your wallet is connected to ${clusterDescriptor} and that your holdings match the GRMC mint above. If your GRMC lives on another cluster (e.g., devnet), update <code>window.GRMC_GATE_CONFIG.rpcEndpoint</code> and <code>cluster</code> to match, then reconnect.${diagnosticsHint}`;
  }

  function showPlayReadyState(publicKey) {
    if (!startButton) {
      launchGameScene();
      return;
    }

    startButton.dataset.mode = 'holder';
    startButton.dataset.ready = 'true';
    startButton.textContent = startButtonDefaultLabel;
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
    window.GRMCState.restrictedAccess = false;
    window.GRMCState.publicKey = publicKey || window.GRMCState.publicKey;
    applyAccessStyles();
    updateClusterIndicator();
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

  function showRestrictedAccess(publicKey, message) {
    if (startButton) {
      startButton.hidden = false;
      startButton.disabled = false;
      startButton.dataset.mode = 'restricted';
      startButton.textContent = 'Enter Kitchen (Restricted)';
    }
    connectButton.hidden = true;
    toggleLoading(false);
    const statusMessage = message || 'GRMC balance could not be confirmed. You can still enter with limited features.';
    setStatus(statusMessage);
    window.GRMCState.publicKey = publicKey || window.GRMCState.publicKey;
    window.GRMCState.isHolder = false;
    window.GRMCState.trialMode = false;
    window.GRMCState.restrictedAccess = true;
    applyAccessStyles();
    window.emitWalletEvent('access-update', {
      isHolder: false,
      trialMode: false,
      restrictedAccess: true,
      publicKey: window.GRMCState.publicKey,
    });
    window.emitWalletEvent('connected', { publicKey: window.GRMCState.publicKey, isHolder: false, restrictedAccess: true });
    updateClusterIndicator();
    if (startButton && typeof startButton.focus === 'function') {
      try {
        startButton.focus({ preventScroll: true });
      } catch (err) {
        startButton.focus();
      }
    }
  }

  function resetGateMessaging() {
    hasVerifiedToken = false;
    if (overlay) {
      overlay.hidden = false;
      overlay.removeAttribute('aria-hidden');
      overlay.classList.remove('wallet-gate--hidden');
      overlay.style.pointerEvents = 'auto';
    }
    const baselineMessage = config.devBypass
      ? 'Demo mode active. Full access is unlocked without wallet verification.'
      : 'A GRMC balance check is required before full access begins.';
    setStatus(baselineMessage);
    showError('');
    toggleLoading(false);
    connectButton.hidden = false;
    connectButton.disabled = false;
    if (startButton) {
      startButton.hidden = true;
      startButton.disabled = true;
      delete startButton.dataset.ready;
      delete startButton.dataset.mode;
      startButton.textContent = startButtonDefaultLabel;
    }
    if (trialButton) {
      trialButton.hidden = false;
      trialButton.disabled = false;
    }
    delete window.GRMCState.lastBalanceCheck;
    window.GRMCState.restrictedAccess = false;
    window.GRMCState.onchainGrmc = 0;
    window.GRMCState.onchainGrmcRaw = '0';
    window.GRMCState.diagnostics = null;
    window.GRMCState.devBypass = Boolean(config.devBypass);
    updateClusterIndicator();
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
        window.GRMCState.publicKey = publicKey;
        await establishSession(publicKey);
        const message = buildMissingTokenMessage();
        showError(message);
        showRestrictedAccess(publicKey, 'GRMC balance could not be confirmed. You can still enter with limited features.');
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
    const baseDiagnostics = {
      cluster: config.cluster,
      rpcEndpoint: config.rpcEndpoint,
      mint: config.mintAddress,
    };

    const updateStateAndEmit = (inputState) => {
      const normalized = {
        totalBalance: Number.isFinite(inputState?.totalBalance) ? inputState.totalBalance : 0,
        foundAccounts: Boolean(inputState?.foundAccounts),
        meetsRequirement: Boolean(inputState?.meetsRequirement),
        timestamp: inputState?.timestamp || Date.now(),
        accountCount: Number.isFinite(inputState?.accountCount) ? inputState.accountCount : 0,
        rawBalance:
          typeof inputState?.rawBalance === 'string'
            ? inputState.rawBalance
            : String(inputState?.rawBalance ?? '0'),
        diagnostics: { ...baseDiagnostics, ...(inputState?.diagnostics || {}) },
        error: inputState?.error,
      };

      window.GRMCState.lastBalanceCheck = normalized;
      window.GRMCState.onchainGrmc = normalized.totalBalance;
      window.GRMCState.onchainGrmcRaw = normalized.rawBalance;
      window.GRMCState.diagnostics = normalized.diagnostics;

      if (emitEvents) {
        const formattedBalance = Number.isFinite(normalized.totalBalance)
          ? normalized.totalBalance.toLocaleString('en-US', { maximumFractionDigits: 6 })
          : '0';
        window.emitWalletEvent('balance-update', {
          totalBalance: normalized.totalBalance,
          formattedBalance,
          meetsRequirement: normalized.meetsRequirement,
          source: 'grmc',
          rawBalance: normalized.rawBalance,
          diagnostics: normalized.diagnostics,
        });
        window.emitWalletEvent('grmc-balance', {
          totalBalance: normalized.totalBalance,
          meetsRequirement: normalized.meetsRequirement,
          accountCount: normalized.accountCount,
          rawBalance: normalized.rawBalance,
          programUsed: normalized.diagnostics?.programUsed,
          diagnostics: normalized.diagnostics,
        });
        window.emitWalletEvent('grmc-balance-diagnostics', { diagnostics: normalized.diagnostics });
        window.emitWalletEvent('grmc-balance-update', {
          ui: normalized.totalBalance,
          raw: normalized.rawBalance,
          program: normalized.diagnostics?.programUsed,
          diagnostics: normalized.diagnostics,
        });
      }

      return normalized;
    };

    if (config.devBypass) {
      const fakeBalance = Math.max(Number(config.minTokenBalance) || 1, 1) * 1000;
      const diagnostics = {
        ...baseDiagnostics,
        programUsed: 'bypass',
        tokenProgramFound: 'bypass',
        decimals: 0,
        raw: String(fakeBalance),
        bypass: true,
        note: 'Demo bypass active (no RPC check performed).',
      };
      const state = {
        totalBalance: fakeBalance,
        foundAccounts: true,
        meetsRequirement: true,
        accountCount: 1,
        rawBalance: diagnostics.raw,
        diagnostics,
      };
      console.info('[GRMC Gate] Demo bypass providing synthetic GRMC balance.', diagnostics);
      return updateStateAndEmit(state);
    }

    if (!ensureWeb3Ready()) {
      const diagnostics = { ...baseDiagnostics, error: 'Solana web3 unavailable' };
      const state = {
        totalBalance: 0,
        foundAccounts: false,
        meetsRequirement: false,
        accountCount: 0,
        rawBalance: '0',
        diagnostics,
        error: diagnostics.error,
      };
      return updateStateAndEmit(state);
    }

    try {
      const connection = getConnection();
      if (!connection) {
        throw new Error('Solana RPC unavailable');
      }

      if (!publicKeyString) {
        throw new Error('Wallet public key missing');
      }

      const { PublicKey } = solanaWeb3;
      let owner;
      try {
        owner = new PublicKey(publicKeyString);
      } catch (error) {
        throw new Error('Invalid wallet public key');
      }

      const mintKey = getMintPublicKey();
      if (!mintKey) {
        throw new Error('GRMC mint not configured');
      }

      const configuredMinimum = Number(config.minTokenBalance);
      const minimumBalance = Number.isFinite(configuredMinimum) ? configuredMinimum : 1;
      const fetchConfig = { encoding: 'jsonParsed', commitment: config.commitment || 'confirmed' };
      const decimals = await fetchMintDecimals(connection, mintKey);
      const legacyProgramId = new PublicKey(TOKEN_PROGRAM_IDS.legacy);
      const token2022ProgramId = new PublicKey(TOKEN_PROGRAM_IDS.token2022);
      const seenAccounts = new Set();

      const summarizeAccounts = (accounts) => {
        let raw = 0n;
        const accountKeys = [];
        accounts.forEach((entry) => {
          const info = entry?.account?.data?.parsed?.info;
          const amountStr = info?.tokenAmount?.amount ?? info?.tokenAmount?.tokenAmount?.amount ?? '0';
          try {
            raw += BigInt(amountStr);
          } catch (error) {
            console.warn('[GRMC Gate] Unable to parse token amount for account', error);
          }
          const address =
            typeof entry?.pubkey === 'string'
              ? entry.pubkey
              : entry?.pubkey?.toBase58?.();
          if (address) {
            accountKeys.push(address);
            seenAccounts.add(address);
          }
        });
        return { raw, accountKeys };
      };

      const fetchAccounts = async (programId, label) => {
        try {
          const response = await connection.getTokenAccountsByOwner(
            owner,
            { mint: mintKey, programId },
            fetchConfig,
          );
          const accounts = Array.isArray(response?.value) ? response.value : [];
          const summary = summarizeAccounts(accounts);
          return {
            raw: summary.raw,
            accounts: accounts.length,
            accountKeys: summary.accountKeys,
          };
        } catch (error) {
          console.warn(`[GRMC Gate] ${label} balance fetch failed:`, error);
          return { raw: 0n, accounts: 0, accountKeys: [], error };
        }
      };

      const [legacyResult, token2022Result] = await Promise.all([
        fetchAccounts(legacyProgramId, 'Legacy SPL Token'),
        fetchAccounts(token2022ProgramId, 'Token-2022'),
      ]);

      const rawTotal = legacyResult.raw + token2022Result.raw;
      const totalBalance = rawToNumber(rawTotal, decimals);
      const tokenProgramFound = (() => {
        if (legacyResult.raw > 0n && token2022Result.raw > 0n) return 'mixed';
        if (legacyResult.raw > 0n) return 'token';
        if (token2022Result.raw > 0n) return 'token-2022';
        if (legacyResult.accounts > 0) return 'token';
        if (token2022Result.accounts > 0) return 'token-2022';
        return 'none';
      })();

      const diagnostics = {
        ...baseDiagnostics,
        decimals,
        raw: rawTotal.toString(),
        legacyRaw: legacyResult.raw.toString(),
        token2022Raw: token2022Result.raw.toString(),
        legacyAccounts: legacyResult.accounts,
        token2022Accounts: token2022Result.accounts,
        programUsed: tokenProgramFound,
        tokenProgramFound,
        legacyError: legacyResult.error ? legacyResult.error.message || String(legacyResult.error) : undefined,
        token2022Error: token2022Result.error ? token2022Result.error.message || String(token2022Result.error) : undefined,
        ui: totalBalance,
      };

      if (!Number.isFinite(totalBalance) || rawTotal === 0n) {
        diagnostics.tip = 'No GRMC detected. Confirm your wallet cluster and RPC endpoint match the token mint.';
      }
      if (legacyResult.error || token2022Result.error) {
        diagnostics.error = legacyResult.error?.message || token2022Result.error?.message || diagnostics.tip;
      }

      const state = {
        totalBalance,
        foundAccounts: seenAccounts.size > 0,
        meetsRequirement: Number.isFinite(totalBalance) ? totalBalance >= minimumBalance : false,
        accountCount: seenAccounts.size,
        rawBalance: rawTotal.toString(),
        diagnostics,
      };

      console.info('[GRMC Gate] Balance check complete', {
        wallet: publicKeyString,
        totalBalance,
        program: diagnostics.programUsed,
        cluster: diagnostics.cluster,
        rpcEndpoint: diagnostics.rpcEndpoint,
        legacyAccounts: legacyResult.accounts,
        token2022Accounts: token2022Result.accounts,
        legacyError: diagnostics.legacyError,
        token2022Error: diagnostics.token2022Error,
      });

      return updateStateAndEmit(state);
    } catch (error) {
      console.error('[GRMC Gate] Balance check failed:', error);
      const diagnostics = {
        ...baseDiagnostics,
        error: error?.message || 'Unknown error',
      };
      const state = {
        totalBalance: 0,
        foundAccounts: false,
        meetsRequirement: false,
        accountCount: 0,
        rawBalance: '0',
        diagnostics,
        error: diagnostics.error,
      };
      return updateStateAndEmit(state);
    }
  }

  async function verifyGatedToken(publicKeyString) {
    if (config.devBypass) {
      return true;
    }
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
      window.GRMCState.restrictedAccess = false;
      applyAccessStyles();
      window.emitWalletEvent('access-update', {
        isHolder: false,
        trialMode: window.GRMCState.trialMode,
        restrictedAccess: false,
      });
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
      window.emitWalletEvent('access-update', { isHolder: false, trialMode: false, restrictedAccess: false });
      window.emitWalletEvent('disconnected', {});
      window.emitWalletEvent('chefcoins-update', { chefcoins: 0 });
      window.emitWalletEvent('grmc-balance', { totalBalance: 0, meetsRequirement: false, accountCount: 0 });
    });
  }

  document.addEventListener('DOMContentLoaded', async () => {
    resetGateMessaging();
    handleWalletEvents();
    provider = pickProvider();
    setupDevControls();

    if (config.devBypass) {
      const demoPublicKey = window.GRMCState.publicKey || DEMO_PUBLIC_KEY;
      window.GRMCState.publicKey = demoPublicKey;
      window.GRMCState.devBypass = true;
      window.GRMCState.sessionJwt = window.GRMCState.sessionJwt || 'dev';
      window.GRMCState.chefcoins = window.GRMCState.chefcoins || DEMO_CHEFCOINS;
      applyAccessStyles();
      updateClusterIndicator();
      await updateGrmcBalance(demoPublicKey, { emitEvents: true });
      hasVerifiedToken = true;
      window.emitWalletEvent('session', {
        token: window.GRMCState.sessionJwt,
        publicKey: demoPublicKey,
        devBypass: true,
      });
      window.emitWalletEvent('chefcoins-update', { chefcoins: window.GRMCState.chefcoins });
      setStatus('Demo mode active. Click “Enter Full Kitchen” to start.');
      showPlayReadyState(demoPublicKey);
      return;
    }

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
          window.GRMCState.publicKey = publicKey;
          await establishSession(publicKey);
          const message = buildMissingTokenMessage();
          showError(message);
          showRestrictedAccess(publicKey, 'GRMC balance could not be confirmed. You can still enter with limited features.');
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
    if (config.devBypass) {
      hasVerifiedToken = true;
      window.GRMCState.devBypass = true;
      window.GRMCState.sessionJwt = window.GRMCState.sessionJwt || 'dev';
      window.GRMCState.isHolder = true;
    }
    if (startButton?.dataset.mode === 'restricted') {
      window.GRMCState.trialMode = false;
      window.GRMCState.isHolder = false;
      window.GRMCState.restrictedAccess = true;
      applyAccessStyles();
      window.emitWalletEvent('access-update', {
        isHolder: false,
        trialMode: false,
        restrictedAccess: true,
        publicKey: window.GRMCState.publicKey,
      });
      console.warn('[GRMC Gate] Entering restricted kitchen mode.');
      launchGameScene({ directGame: true });
      return;
    }

    if (!hasVerifiedToken) {
      showError('Please connect a GRMC-holding wallet before starting the game.');
      return;
    }
    window.GRMCState.trialMode = false;
    window.GRMCState.isHolder = true;
    window.GRMCState.restrictedAccess = false;
    applyAccessStyles();
    window.emitWalletEvent('access-update', {
      isHolder: true,
      trialMode: false,
      restrictedAccess: false,
      publicKey: window.GRMCState.publicKey,
    });
    console.info('[GRMC Gate] Starting full access kitchen experience.');
    launchGameScene({ directGame: true });
  }

  function startTrial() {
    window.GRMCState.trialMode = true;
    window.GRMCState.isHolder = false;
    window.GRMCState.restrictedAccess = false;
    window.GRMCState.sessionJwt = null;
    applyAccessStyles();
    window.emitWalletEvent('access-update', { isHolder: false, trialMode: true, restrictedAccess: false });
    window.emitWalletEvent('trial-started', { trialMode: true });
    console.info('[GRMC Gate] Trial mode launching GameScene.');
    launchGameScene({ directGame: true });
  }

  startButton?.addEventListener('click', startFullAccess);
  trialButton?.addEventListener('click', startTrial);
})();
