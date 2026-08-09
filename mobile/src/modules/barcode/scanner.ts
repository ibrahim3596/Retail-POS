// Barcode scanning service using React Native Vision Camera
import { useCallback, useRef, useState } from 'react';
import { Camera, useCameraDevice, useCodeScanner } from 'react-native-vision-camera';
import { APP_CONFIG } from '../../config/app';

export interface BarcodeScanResult {
  type: string;
  value: string;
}

/**
 * Hook for barcode scanning functionality
 */
export function useBarcodeScanner() {
  const [isScanning, setIsScanning] = useState(false);
  const [lastScanned, setLastScanned] = useState<string | null>(null);
  const lastScanTime = useRef<number>(0);
  const device = useCameraDevice('back');

  const codeScanner = useCodeScanner({
    codeTypes: ['ean-13', 'ean-8', 'upc-a', 'upc-e', 'code-128', 'code-39', 'qr'],
    onCodeScanned: (codes) => {
      if (codes.length === 0) return;

      const now = Date.now();
      const barcodeValue = codes[0]?.value;

      if (!barcodeValue) return;

      // Debounce to prevent rapid duplicate scans
      if (barcodeValue === lastScanned && now - lastScanTime.current < APP_CONFIG.BARCODE_DEBOUNCE_MS) {
        return;
      }

      lastScanTime.current = now;
      setLastScanned(barcodeValue);
    },
  });

  const startScanning = useCallback(() => {
    setIsScanning(true);
    setLastScanned(null);
  }, []);

  const stopScanning = useCallback(() => {
    setIsScanning(false);
  }, []);

  const resetScan = useCallback(() => {
    setLastScanned(null);
    lastScanTime.current = 0;
  }, []);

  return {
    device,
    codeScanner,
    isScanning,
    lastScanned,
    startScanning,
    stopScanning,
    resetScan,
    hasCamera: device != null,
  };
}

/**
 * Validate barcode format
 */
export function isValidBarcode(barcode: string): boolean {
  if (!barcode || barcode.length < 8 || barcode.length > 18) return false;
  // Check if it's a valid EAN/UPC format
  return /^[0-9]{8,18}$/.test(barcode);
}

/**
 * Lookup product by barcode from local database
 */
export async function findProductByBarcode(barcode: string): Promise<any | null> {
  const { executeSql } = require('../../shared/database/sqlite');
  const result = await executeSql(
    `SELECT * FROM products WHERE barcode = ? AND is_active = 1 LIMIT 1`,
    [barcode]
  );

  if (result.rows.length > 0) {
    return result.rows.item(0);
  }

  return null;
}
