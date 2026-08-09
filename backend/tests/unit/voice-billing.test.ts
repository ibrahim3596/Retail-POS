// Unit tests for voice billing service
import { parseVoiceCommand, processVoiceCommand, getVoiceCommandsHelp } from '../../src/modules/voice/service';

jest.mock('../../src/shared/database/prisma', () => ({
  prisma: {
    product: {
      findFirst: jest.fn(),
    },
  },
}));

import { prisma } from '../../src/shared/database/prisma';

describe('Voice Billing Service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('parseVoiceCommand', () => {
    it('should parse "add 2 rice" as ADD_ITEM', () => {
      const result = parseVoiceCommand('add 2 rice');
      expect(result.type).toBe('ADD_ITEM');
      expect(result.productName).toBe('rice');
      expect(result.quantity).toBe(2);
    });

    it('should parse "add rice" with default quantity 1', () => {
      const result = parseVoiceCommand('add rice');
      expect(result.type).toBe('ADD_ITEM');
      expect(result.productName).toBe('rice');
      expect(result.quantity).toBe(1);
    });

    it('should parse "remove oil" as REMOVE_ITEM', () => {
      const result = parseVoiceCommand('remove oil');
      expect(result.type).toBe('REMOVE_ITEM');
      expect(result.productName).toBe('oil');
    });

    it('should parse "delete oil" as REMOVE_ITEM', () => {
      const result = parseVoiceCommand('delete oil');
      expect(result.type).toBe('REMOVE_ITEM');
    });

    it('should parse "complete sale" as COMPLETE_SALE', () => {
      const result = parseVoiceCommand('complete sale');
      expect(result.type).toBe('COMPLETE_SALE');
    });

    it('should parse "complete sale cash" with payment method', () => {
      const result = parseVoiceCommand('complete sale cash');
      expect(result.type).toBe('COMPLETE_SALE');
      expect(result.paymentMethod).toBe('CASH');
    });

    it('should parse "complete sale upi" with payment method', () => {
      const result = parseVoiceCommand('complete sale upi');
      expect(result.type).toBe('COMPLETE_SALE');
      expect(result.paymentMethod).toBe('UPI');
    });

    it('should parse "clear cart" as CLEAR_CART', () => {
      const result = parseVoiceCommand('clear cart');
      expect(result.type).toBe('CLEAR_CART');
    });

    it('should parse "show total" as SHOW_TOTAL', () => {
      const result = parseVoiceCommand('show total');
      expect(result.type).toBe('SHOW_TOTAL');
    });

    it('should parse "discount 10%" as APPLY_DISCOUNT', () => {
      const result = parseVoiceCommand('discount 10%');
      expect(result.type).toBe('APPLY_DISCOUNT');
      expect(result.discount).toBe(10);
    });

    it('should parse "remove discount" as REMOVE_DISCOUNT', () => {
      const result = parseVoiceCommand('remove discount');
      expect(result.type).toBe('REMOVE_DISCOUNT');
    });

    it('should handle Hindi commands', () => {
      const result = parseVoiceCommand('bill karo');
      expect(result.type).toBe('COMPLETE_SALE');
    });

    it('should return UNKNOWN for unrecognized commands', () => {
      const result = parseVoiceCommand('hello world foo bar');
      expect(result.type).toBe('UNKNOWN');
    });
  });

  describe('processVoiceCommand', () => {
    it('should process ADD_ITEM command', async () => {
      const mockProduct = {
        id: 'prod-1',
        name: 'Rice',
        sellingPrice: 100,
        currentStock: 50,
        gstRate: 5,
        taxType: 'GST',
      };

      (prisma.product.findFirst as jest.Mock).mockResolvedValue(mockProduct);

      const result = await processVoiceCommand('store-1', 'add 2 rice');

      expect(result.success).toBe(true);
      expect(result.actionTaken).toBe('add_item');
      expect(result.message).toContain('Rice');
    });

    it('should fail for unknown product', async () => {
      (prisma.product.findFirst as jest.Mock).mockResolvedValue(null);

      const result = await processVoiceCommand('store-1', 'add xyzunknown');

      expect(result.success).toBe(false);
      expect(result.message).toContain('not found');
    });

    it('should process COMPLETE_SALE', async () => {
      const result = await processVoiceCommand('store-1', 'complete sale cash');

      expect(result.success).toBe(true);
      expect(result.actionTaken).toBe('complete_sale');
    });

    it('should process CLEAR_CART', async () => {
      const result = await processVoiceCommand('store-1', 'clear cart');

      expect(result.success).toBe(true);
      expect(result.actionTaken).toBe('clear_cart');
    });

    it('should handle unknown commands gracefully', async () => {
      const result = await processVoiceCommand('store-1', 'foobar baz');

      expect(result.success).toBe(false);
      expect(result.command.type).toBe('UNKNOWN');
    });
  });

  describe('getVoiceCommandsHelp', () => {
    it('should return list of available commands', () => {
      const commands = getVoiceCommandsHelp();
      expect(commands.length).toBeGreaterThan(0);
      expect(commands[0]).toHaveProperty('command');
      expect(commands[0]).toHaveProperty('description');
    });
  });
});
