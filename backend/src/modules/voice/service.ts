// Voice Billing service
// Processes natural language voice commands for POS operations
import { prisma } from '@shared/database/prisma';
import { logger } from '@shared/utils/logger';

export type VoiceCommandType =
  | 'ADD_ITEM'
  | 'REMOVE_ITEM'
  | 'UPDATE_QUANTITY'
  | 'APPLY_DISCOUNT'
  | 'REMOVE_DISCOUNT'
  | 'COMPLETE_SALE'
  | 'CLEAR_CART'
  | 'SHOW_TOTAL'
  | 'UNKNOWN';

export interface VoiceCommand {
  type: VoiceCommandType;
  productName?: string;
  quantity?: number;
  discount?: number;
  paymentMethod?: string;
  rawText: string;
}

export interface VoiceProcessingResult {
  command: VoiceCommand;
  success: boolean;
  message: string;
  actionTaken: string;
}

/**
 * Parse voice text into structured command
 * Supports English and Hindi (transliterated)
 */
export function parseVoiceCommand(text: string): VoiceCommand {
  const normalized = text.toLowerCase().trim();

  // Complete sale commands
  if (matchesAny(normalized, ['complete sale', 'done', 'finish', 'pay', 'bill karo', 'billing karo'])) {
    return {
      type: 'COMPLETE_SALE',
      paymentMethod: extractPaymentMethod(normalized),
      rawText: text,
    };
  }

  // Clear cart commands
  if (matchesAny(normalized, ['clear cart', 'cancel', 'reset', 'clear all', 'cart clear karo'])) {
    return { type: 'CLEAR_CART', rawText: text };
  }

  // Show total commands
  if (matchesAny(normalized, ['show total', 'total', 'kitna hua', 'total kitna'])) {
    return { type: 'SHOW_TOTAL', rawText: text };
  }

  // Remove discount commands (check before remove item)
  if (matchesAny(normalized, ['remove discount', 'discount hatao', 'no discount', 'cancel discount'])) {
    return { type: 'REMOVE_DISCOUNT', rawText: text };
  }

  // Remove item commands
  const removeMatch = normalized.match(/(?:remove|delete|hatao|nikal)\s+(.+)/);
  if (removeMatch) {
    return {
      type: 'REMOVE_ITEM',
      productName: removeMatch[1].trim(),
      rawText: text,
    };
  }

  // Discount commands
  const discountMatch = normalized.match(/(?:discount|disc)\s+(\d+)\s*(%|percent|percent)?/);
  if (discountMatch || matchesAny(normalized, ['apply discount', 'discount lagao'])) {
    const percent = discountMatch ? parseInt(discountMatch[1], 10) : 0;
    return {
      type: 'APPLY_DISCOUNT',
      discount: percent,
      rawText: text,
    };
  }

  // Remove discount commands
  if (matchesAny(normalized, ['remove discount', 'discount hatao', 'no discount'])) {
    return { type: 'REMOVE_DISCOUNT', rawText: text };
  }

  // Add item commands (most common)
  // Patterns: "add 2 rice", "add rice", "2 rice add karo", "rice 2"
  const addPatterns = [
    /(?:add|dao|add karo|dal do)\s+(\d+)\s+(.+)/,
    /(?:add|dao|add karo|dal do)\s+(.+)/,
  ];

  for (const pattern of addPatterns) {
    const match = normalized.match(pattern);
    if (match) {
      let quantity = 1;
      let productName = '';

      if (match.length === 3) {
        const num = parseInt(match[1], 10);
        if (!isNaN(num) && num > 0 && num < 1000) {
          quantity = num;
          productName = match[2].trim();
        }
      } else if (match.length === 2) {
        productName = match[1].trim();
      }

      if (productName && productName.length > 1) {
        return {
          type: 'ADD_ITEM',
          productName,
          quantity,
          rawText: text,
        };
      }
    }
  }

  return { type: 'UNKNOWN', rawText: text };
}

/**
 * Process voice command against current cart
 */
export async function processVoiceCommand(
  storeId: string,
  text: string
): Promise<VoiceProcessingResult> {
  const command = parseVoiceCommand(text);

  switch (command.type) {
    case 'ADD_ITEM': {
      if (!command.productName) {
        return {
          command,
          success: false,
          message: 'Could not identify product name',
          actionTaken: 'none',
        };
      }

      // Try to find product by name (fuzzy match)
      const product = await findProductByName(storeId, command.productName);

      if (!product) {
        return {
          command,
          success: false,
          message: `Product "${command.productName}" not found`,
          actionTaken: 'none',
        };
      }

      return {
        command: { ...command, productName: product.name },
        success: true,
        message: `Added ${command.quantity}x ${product.name}`,
        actionTaken: 'add_item',
      };
    }

    case 'REMOVE_ITEM': {
      return {
        command,
        success: true,
        message: `Remove "${command.productName}" from cart`,
        actionTaken: 'remove_item',
      };
    }

    case 'APPLY_DISCOUNT': {
      return {
        command,
        success: true,
        message: `Applied ${command.discount}% discount`,
        actionTaken: 'apply_discount',
      };
    }

    case 'REMOVE_DISCOUNT': {
      return {
        command,
        success: true,
        message: 'Discount removed',
        actionTaken: 'remove_discount',
      };
    }

    case 'COMPLETE_SALE': {
      return {
        command,
        success: true,
        message: `Completing sale${command.paymentMethod ? ` via ${command.paymentMethod}` : ''}`,
        actionTaken: 'complete_sale',
      };
    }

    case 'CLEAR_CART': {
      return {
        command,
        success: true,
        message: 'Cart cleared',
        actionTaken: 'clear_cart',
      };
    }

    case 'SHOW_TOTAL': {
      return {
        command,
        success: true,
        message: 'Showing cart total',
        actionTaken: 'show_total',
      };
    }

    default: {
      return {
        command,
        success: false,
        message: `Could not understand: "${text}"`,
        actionTaken: 'none',
      };
    }
  }
}

/**
 * Find product by name with fuzzy matching
 */
async function findProductByName(storeId: string, name: string): Promise<any | null> {
  // First try exact match
  let product = await prisma.product.findFirst({
    where: {
      storeId,
      isActive: true,
      name: { equals: name, mode: 'insensitive' },
    },
  });

  if (product) return product;

  // Try contains match
  product = await prisma.product.findFirst({
    where: {
      storeId,
      isActive: true,
      name: { contains: name, mode: 'insensitive' },
    },
  });

  return product;
}

/**
 * Extract payment method from voice command
 */
function extractPaymentMethod(text: string): string | undefined {
  if (text.includes('cash')) return 'CASH';
  if (text.includes('upi') || text.includes('phonepe') || text.includes('gpay') || text.includes('google pay')) return 'UPI';
  if (text.includes('card') || text.includes('credit card') || text.includes('debit card')) return 'CARD';
  if (text.includes('credit')) return 'CREDIT';
  return undefined;
}

/**
 * Check if text matches any of the patterns
 */
function matchesAny(text: string, patterns: string[]): boolean {
  return patterns.some((pattern) => text.includes(pattern));
}

/**
 * Get available voice commands help
 */
export function getVoiceCommandsHelp(): Array<{ command: string; description: string }> {
  return [
    { command: 'Add [quantity] [product]', description: 'Add item to cart' },
    { command: 'Remove [product]', description: 'Remove item from cart' },
    { command: 'Discount [percent]%', description: 'Apply discount to cart' },
    { command: 'Remove discount', description: 'Remove discount from cart' },
    { command: 'Complete sale [payment]', description: 'Complete the sale' },
    { command: 'Clear cart', description: 'Clear all items from cart' },
    { command: 'Show total', description: 'Show cart total' },
    { command: 'Bill karo / Billing karo', description: 'Complete sale (Hindi)' },
    { command: 'Cart clear karo', description: 'Clear cart (Hindi)' },
  ];
}
