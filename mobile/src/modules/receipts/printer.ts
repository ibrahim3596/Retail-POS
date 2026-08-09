// Receipt printing service for Bluetooth/Wi-Fi thermal printers
import { Platform } from 'react-native';
import { APP_CONFIG } from '../../config/app';
import apiClient from '../api/client';

// Printer connection states
export type PrinterConnectionState = 'disconnected' | 'connecting' | 'connected' | 'error';

export interface PrinterDevice {
  id: string;
  name: string;
  type: 'bluetooth' | 'wifi';
  address: string;
}

/**
 * Receipt printer service
 * Supports both Bluetooth and Wi-Fi thermal printers
 */
class ReceiptPrinterService {
  private connectionState: PrinterConnectionState = 'disconnected';
  private connectedDevice: PrinterDevice | null = null;
  private printQueue: string[] = [];

  /**
   * Get current connection state
   */
  getConnectionState(): PrinterConnectionState {
    return this.connectionState;
  }

  /**
   * Get connected device info
   */
  getConnectedDevice(): PrinterDevice | null {
    return this.connectedDevice;
  }

  /**
   * Scan for Bluetooth printers
   * Note: Requires react-native-bluetooth-serial or similar library
   */
  async scanBluetoothPrinters(): Promise<PrinterDevice[]> {
    // In a real implementation, this would use react-native-bluetooth-serial
    // or react-native-bluetooth-classic to scan for paired devices
    // For now, return mock data for development
    logger.warn('Bluetooth scanning not implemented in this version');
    return [];
  }

  /**
   * Connect to a Wi-Fi printer
   * @param ipAddress - IP address of the Wi-Fi printer
   * @param port - Port number (default 9100)
   */
  async connectWiFiPrinter(ipAddress: string, port: number = 9100): Promise<boolean> {
    this.connectionState = 'connecting';

    try {
      // In a real implementation, this would use react-native-tcp-socket
      // to connect to the Wi-Fi printer
      // For development, simulate connection
      this.connectedDevice = {
        id: `wifi-${ipAddress}`,
        name: `WiFi Printer (${ipAddress})`,
        type: 'wifi',
        address: `${ipAddress}:${port}`,
      };
      this.connectionState = 'connected';
      return true;
    } catch (error) {
      this.connectionState = 'error';
      return false;
    }
  }

  /**
   * Connect to a Bluetooth printer
   */
  async connectBluetoothPrinter(deviceId: string): Promise<boolean> {
    this.connectionState = 'connecting';

    try {
      // In a real implementation, this would use react-native-bluetooth-serial
      // to connect to the paired Bluetooth device
      this.connectedDevice = {
        id: deviceId,
        name: `Bluetooth Printer`,
        type: 'bluetooth',
        address: deviceId,
      };
      this.connectionState = 'connected';
      return true;
    } catch (error) {
      this.connectionState = 'error';
      return false;
    }
  }

  /**
   * Disconnect from current printer
   */
  async disconnect(): Promise<void> {
    this.connectionState = 'disconnected';
    this.connectedDevice = null;
  }

  /**
   * Print a receipt by invoice ID
   * Fetches formatted receipt from API and sends to printer
   */
  async printReceipt(invoiceId: string): Promise<boolean> {
    try {
      const response = await apiClient.get(`/receipts/${invoiceId}/print`);
      const printerText = response.data.data.text;

      return this.printText(printerText);
    } catch (error) {
      logger.error('Failed to fetch receipt for printing', { error });
      return false;
    }
  }

  /**
   * Print raw text to thermal printer
   * Handles printer-specific ESC/POS commands
   */
  async printText(text: string): Promise<boolean> {
    if (this.connectionState !== 'connected') {
      logger.warn('Printer not connected');
      return false;
    }

    try {
      // In a real implementation, this would:
      // 1. Convert text to ESC/POS commands
      // 2. Send to printer via Bluetooth or TCP socket

      // ESC/POS commands for thermal printers
      const ESC = '\x1B';
      const commands = [
        ESC + '@',           // Initialize printer
        ESC + 'a' + '\x01',  // Center alignment
        text,
        ESC + 'd' + '\x05',  // Feed 5 lines
        ESC + 'm',           // Cut paper (partial cut)
      ];

      const printerData = commands.join('');

      // Send to printer (implementation depends on connection type)
      if (this.connectedDevice?.type === 'wifi') {
        // Send via TCP socket
        await this.sendWiFi(printerData);
      } else {
        // Send via Bluetooth
        await this.sendBluetooth(printerData);
      }

      return true;
    } catch (error) {
      logger.error('Print failed', { error });
      return false;
    }
  }

  /**
   * Send data to Wi-Fi printer
   */
  private async sendWiFi(data: string): Promise<void> {
    // Implementation with react-native-tcp-socket
    // Example: socket.write(data);
    logger.info('Sending to WiFi printer', { device: this.connectedDevice?.address });
  }

  /**
   * Send data to Bluetooth printer
   */
  private async sendBluetooth(data: string): Promise<void> {
    // Implementation with react-native-bluetooth-serial
    // Example: BluetoothSerial.write(data);
    logger.info('Sending to Bluetooth printer', { device: this.connectedDevice?.id });
  }

  /**
   * Generate ESC/POS formatted receipt from data
   * Low-level printer command generation
   */
  generateEscPosReceipt(receiptData: any): string {
    const ESC = '\x1B';
    const GS = '\x1D';
    let commands = '';

    // Initialize
    commands += ESC + '@';

    // Store name - bold, centered, double size
    commands += ESC + 'a' + '\x01'; // Center
    commands += ESC + '!' + '\x30'; // Double width + height + bold
    commands += receiptData.store.name + '\n';
    commands += ESC + '!' + '\x00'; // Reset font

    if (receiptData.store.gstin) {
      commands += `GSTIN: ${receiptData.store.gstin}\n`;
    }
    if (receiptData.store.address) {
      commands += `${receiptData.store.address}\n`;
    }

    commands += '================================\n';

    // Invoice details - left aligned
    commands += ESC + 'a' + '\x00'; // Left align
    commands += `Invoice: ${receiptData.invoice.invoiceNumber}\n`;
    commands += `Date: ${receiptData.invoice.date}\n`;

    if (receiptData.invoice.customerName) {
      commands += `Customer: ${receiptData.invoice.customerName}\n`;
    }

    commands += '--------------------------------\n';

    // Items
    commands += `Item              Qty    Amount\n`;
    commands += '--------------------------------\n';

    for (const item of receiptData.items) {
      const name = item.name.substring(0, 15).padEnd(15);
      const qty = item.quantity.toString().padStart(4);
      const amount = item.totalAmount.toFixed(2).padStart(8);
      commands += `${name} ${qty} ${amount}\n`;
    }

    commands += '--------------------------------\n';

    // Summary
    commands += `Subtotal:             ${receiptData.summary.subtotal.toFixed(2)}\n`;

    if (receiptData.summary.discount > 0) {
      commands += `Discount:            -${receiptData.summary.discount.toFixed(2)}\n`;
    }

    if (receiptData.summary.cgst > 0) {
      commands += `CGST:                 ${receiptData.summary.cgst.toFixed(2)}\n`;
    }

    if (receiptData.summary.sgst > 0) {
      commands += `SGST:                 ${receiptData.summary.sgst.toFixed(2)}\n`;
    }

    if (receiptData.summary.igst > 0) {
      commands += `IGST:                 ${receiptData.summary.igst.toFixed(2)}\n`;
    }

    commands += '--------------------------------\n';

    // Grand total - bold
    commands += ESC + '!' + '\x08'; // Bold
    commands += `TOTAL:                ${receiptData.summary.grandTotal.toFixed(2)}\n`;
    commands += ESC + '!' + '\x00'; // Reset

    commands += '================================\n';
    commands += `Payment: ${receiptData.summary.paymentMethod}\n`;
    commands += '\n';
    commands += ESC + 'a' + '\x01'; // Center
    commands += '     Thank you for visiting!\n';
    commands += ESC + 'a' + '\x00'; // Left align
    commands += '\n';

    // Feed and cut
    commands += ESC + 'd' + '\x05'; // Feed 5 lines
    commands += GS + 'V' + '\x41' + '\x00'; // Partial cut

    return commands;
  }
}

// Singleton instance
export const receiptPrinter = new ReceiptPrinterService();

// Simple logger (replace with proper logging in production)
const logger = {
  info: (message: string, data?: any) => console.log(`[Printer] ${message}`, data || ''),
  warn: (message: string, data?: any) => console.warn(`[Printer] ${message}`, data || ''),
  error: (message: string, data?: any) => console.error(`[Printer] ${message}`, data || ''),
};

export default receiptPrinter;
