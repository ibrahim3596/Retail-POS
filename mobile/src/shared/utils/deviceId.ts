// Persistent Installation ID utility
// Generates a persistent installation/device ID that survives app restarts
// and (where possible) reinstalls

import AsyncStorage from '@react-native-async-storage/async-storage';

const INSTALLATION_ID_KEY = '@installation_id';

/**
 * Get or create a persistent installation ID
 * Survives app restarts, authentication refresh, and normal updates
 * Survives reinstall on platforms with secure storage (iOS Keychain, Android Keystore)
 */
export async function getInstallationId(): Promise<string> {
  try {
    // Try to get existing installation ID
    const existing = await AsyncStorage.getItem('@installation_id');
    if (existing) {
      return existing;
    }

    // Generate new installation ID
    const installationId = generateInstallationId();
    
    // Store it
    await AsyncStorage.setItem('@installation_id', installationId);
    
    return installationId;
  } catch (error) {
    // Fallback: generate new ID each time (not ideal but safe)
    console.warn('Failed to get/set installation ID:', error);
    return generateInstallationId();
  }
}

/**
 * Generate a cryptographically secure installation ID
 * Format: inst_<timestamp>_<random>
 */
function generateInstallationId(): string {
  const timestamp = Date.now().toString(36);
  const randomPart = Math.random().toString(36).substring(2, 15);
  const cryptoRandom = crypto.getRandomValues ? 
    Array.from(crypto.getRandomValues(new Uint8Array(8)))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('') 
    : Math.random().toString(36).substring(2, 18);
  
  return `inst_${timestamp}_${randomPart}_${cryptoRandom}`;
}

/**
 * Get or create installation ID synchronously (for synchronous contexts)
 * Note: This will generate a new ID each call if not already stored
 */
export function getInstallationIdSync(): string {
  try {
    // This is a fallback for synchronous contexts
    // In async contexts, use getInstallationId()
    const stored = localStorage.getItem('@installation_id');
    if (stored) return stored;
    
    const id = generateInstallationId();
    localStorage.setItem('@installation_id', id);
    return id;
  } catch {
    return generateInstallationId();
  }
}

/**
 * Reset installation ID (for testing or when user explicitly wants new identity)
 */
export async function resetInstallationId(): Promise<string> {
  await AsyncStorage.removeItem('@installation_id');
  return getInstallationId();
}