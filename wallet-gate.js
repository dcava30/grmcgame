(() => {
  const overlay = document.getElementById('wallet-gate-overlay');
  const connectButton = document.getElementById('connect-wallet-button');
  const statusEl = document.getElementById('wallet-status');
  const errorEl = document.getElementById('wallet-error');
  const loadingEl = document.getElementById('wallet-loading');
  const startButton = document.getElementById('start-game-button');
  const trialButton = document.getElementById('trial-game-button');
  const clusterIndicator = document.getElementById('wallet-cluster-indicator');

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
  };

  window.GRMCState = { ...initialState, ...(window.GRMCState || {}) };

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
  };

  const config = { ...defaultConfig, ...(window.GRMC_GATE_CONFIG || {}) };

  config.devWalletAddress = typeof config.devWalletAddress === 'string' && config.devWalletAddress
    ? config.devWalletAddress
    : defaultConfig.devWalletAddress;
  const normalizedCluster = typeof config.cluster === 'string' && config.cluster.trim()
    ? config.cluster.trim()
    : inferClusterFromEndpoint(config.rpcEndpoint);
  config.cluster = normalizedCluster;
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

  function applyStaticState() {
    window.GRMCState.swapTaxBps = config.swapTaxBps;
    window.GRMCState.minSwapAmount = config.minSwapAmount;
    window.GRMCState.devWalletAddress = config.devWalletAddress;
    window.GRMCState.cluster = config.cluster;
    window.GRMCState.rpcEndpoint = config.rpcEndpoint;
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
    document.body.classList.toggle('restricted-mode', Boolean(window.GRMCState.restrictedAccess));
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
      hideOverlay();
      window.BlockyKitchenGame?.create();
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
    setStatus('A GRMC balance check is required before full access begins.');
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

    try {
      if (!ensureWeb3Ready()) {
        const diagnostics = { ...baseDiagnostics, error: 'Solana web3 unavailable' };
        const state = {
          totalBalance: 0,
          foundAccounts: false,
          meetsRequirement: false,
          timestamp: Date.now(),
          accountCount: 0,
          diagnostics,
        };
        window.GRMCState.lastBalanceCheck = state;
        window.GRMCState.onchainGrmc = 0;
        window.GRMCState.onchainGrmcRaw = '0';
        window.GRMCState.diagnostics = diagnostics;
        if (emitEvents) {
          window.emitWalletEvent('balance-update', {
            totalBalance: 0,
            formattedBalance: '0',
            meetsRequirement: false,
            source: 'grmc',
            diagnostics,
          });
          window.emitWalletEvent('grmc-balance', {
            totalBalance: 0,
            meetsRequirement: false,
            accountCount: 0,
            diagnostics,
          });
          window.emitWalletEvent('grmc-balance-diagnostics', { diagnostics });
        }
        return state;
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
      const fetchConfig = { encoding: 'jsonParsed', commitment: config.commitment || 'confirmed' };
      const decimals = await fetchMintDecimals(connection, mintKey);
      const mintBase58 = mintKey.toBase58();

      const diagnostics = {
        ...baseDiagnostics,
        commitment: fetchConfig.commitment,
        decimals,
        raw: '0',
        programUsed: 'none',
        steps: [],
      };

      const legacyProgramId = new PublicKey(TOKEN_PROGRAM_IDS.legacy);
      const token2022ProgramId = new PublicKey(TOKEN_PROGRAM_IDS.token2022);

      const seenAccounts = new Set();
      let totalRaw = 0n;
      let detectedProgram = 'none';

      const summarizeAccounts = (accounts, programLabel) => {
        let matched = 0;
        let rawSum = 0n;
        accounts.forEach((account) => {
          const info = account?.account?.data?.parsed?.info;
          if (!info || info.mint !== mintBase58) {
            return;
          }
          const address = typeof account?.pubkey === 'string'
            ? account.pubkey
            : account?.pubkey?.toBase58?.();
          if (!address) {
            return;
          }
          const amountStr = info?.tokenAmount?.amount ?? info?.tokenAmount?.tokenAmount?.amount ?? '0';
          const rawAmount = safeBigInt(amountStr);
          rawSum += rawAmount;
          if (!seenAccounts.has(address)) {
            seenAccounts.add(address);
            totalRaw += rawAmount;
          }
          matched += 1;
          const ownerProgram = account?.account?.owner;
          if (ownerProgram === legacyProgramId.toBase58()) {
            detectedProgram = 'token';
          } else if (ownerProgram === token2022ProgramId.toBase58()) {
            detectedProgram = 'token-2022';
          } else if (programLabel && detectedProgram === 'none') {
            detectedProgram = programLabel;
          }
        });
        return { accounts: accounts.length, matched, raw: rawSum.toString() };
      };

      const fetchVariant = async (label, filter, programLabel) => {
        try {
          const response = await connection.getTokenAccountsByOwner(owner, filter, fetchConfig);
          const accounts = Array.isArray(response?.value) ? response.value : [];
          const summary = summarizeAccounts(accounts, programLabel);
          diagnostics.steps.push({ label, program: programLabel, ...summary });
          return summary;
        } catch (error) {
          const message = error?.message || String(error);
          diagnostics.steps.push({ label, program: programLabel, error: message });
          if (programLabel === 'token') {
            diagnostics.legacyError = message;
          } else if (programLabel === 'token-2022') {
            diagnostics.token2022Error = message;
          }
          return { accounts: 0, matched: 0, raw: '0' };
        }
      };

      await fetchVariant('mint', { mint: mintKey }, 'mint');
      await fetchVariant('token-program', { programId: legacyProgramId }, 'token');
      await fetchVariant('token-2022', { programId: token2022ProgramId }, 'token-2022');

      diagnostics.programUsed = detectedProgram;
      diagnostics.raw = totalRaw.toString();

      const totalBalance = rawToNumber(totalRaw, decimals);
      const meetsRequirement = Number.isFinite(totalBalance) ? totalBalance >= minimumBalance : false;

      const state = {
        totalBalance,
        foundAccounts: seenAccounts.size > 0,
        meetsRequirement,
        timestamp: Date.now(),
        accountCount: seenAccounts.size,
        rawBalance: totalRaw.toString(),
        diagnostics,
      };

      window.GRMCState.lastBalanceCheck = state;
      window.GRMCState.onchainGrmc = Number.isFinite(totalBalance) ? totalBalance : 0;
      window.GRMCState.onchainGrmcRaw = totalRaw.toString();
      window.GRMCState.diagnostics = diagnostics;

      if (emitEvents) {
        const formattedBalance = Number.isFinite(totalBalance)
          ? totalBalance.toLocaleString('en-US', { maximumFractionDigits: 6 })
          : '0';
        window.emitWalletEvent('balance-update', {
          totalBalance,
          formattedBalance,
          meetsRequirement,
          source: 'grmc',
          rawBalance: totalRaw.toString(),
          diagnostics,
        });
        window.emitWalletEvent('grmc-balance', {
          totalBalance,
          meetsRequirement,
          accountCount: seenAccounts.size,
          rawBalance: totalRaw.toString(),
          programUsed: diagnostics.programUsed,
          diagnostics,
        });
        window.emitWalletEvent('grmc-balance-diagnostics', { diagnostics });
      }

      return state;
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
        timestamp: Date.now(),
        accountCount: 0,
        error: diagnostics.error,
        diagnostics,
      };

      window.GRMCState.lastBalanceCheck = state;
      window.GRMCState.onchainGrmc = 0;
      window.GRMCState.onchainGrmcRaw = '0';
      window.GRMCState.diagnostics = diagnostics;
      if (emitEvents) {
        window.emitWalletEvent('balance-update', {
          totalBalance: 0,
          formattedBalance: '0',
          meetsRequirement: false,
          source: 'grmc',
          diagnostics,
        });
        window.emitWalletEvent('grmc-balance', {
          totalBalance: 0,
          meetsRequirement: false,
          accountCount: 0,
          diagnostics,
        });
        window.emitWalletEvent('grmc-balance-diagnostics', { diagnostics });
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
      hideOverlay();
      window.BlockyKitchenGame?.create();
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
    hideOverlay();
    window.BlockyKitchenGame?.create();
  }

  function startTrial() {
    window.GRMCState.trialMode = true;
    window.GRMCState.isHolder = false;
    window.GRMCState.restrictedAccess = false;
    window.GRMCState.sessionJwt = null;
    applyAccessStyles();
    window.emitWalletEvent('access-update', { isHolder: false, trialMode: true, restrictedAccess: false });
    window.emitWalletEvent('trial-started', { trialMode: true });
    hideOverlay();
    window.BlockyKitchenGame?.create();
  }

  startButton?.addEventListener('click', startFullAccess);
  trialButton?.addEventListener('click', startTrial);
})();
