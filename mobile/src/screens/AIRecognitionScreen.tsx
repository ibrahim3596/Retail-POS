// AI Product Recognition screen
import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
  Alert,
  ActivityIndicator,
  FlatList,
} from 'react-native';
import { launchCamera } from 'react-native-image-picker';
import apiClient from '../../shared/api/client';

interface Prediction {
  productId: string;
  productName: string;
  confidence: number;
  category?: string;
  sellingPrice: number;
  currentStock: number;
}

export function AIRecognitionScreen() {
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [predictions, setPredictions] = useState<Prediction[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);

  const takePhoto = async () => {
    try {
      const result = await launchCamera({
        mediaType: 'photo',
        quality: 0.8,
        includeBase64: true,
      });

      if (result.assets && result.assets[0]) {
        const asset = result.assets[0];
        setImageUri(asset.uri || null);
        processImage(asset.base64 || '');
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to capture image');
    }
  };

  const processImage = async (base64Data: string) => {
    setIsProcessing(true);
    setPredictions([]);

    try {
      const response = await apiClient.post('/ai/recognize', {
        imageData: base64Data,
      });

      setPredictions(response.data.data.predictions);

      if (response.data.data.predictions.length === 0) {
        Alert.alert('No Match', 'Could not identify any product in this image');
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to process image');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleSelectProduct = (product: Prediction) => {
    Alert.alert(
      'Product Found',
      `${product.productName}\nPrice: ₹${product.sellingPrice}\nStock: ${product.currentStock}`,
      [
        { text: 'OK' },
        {
          text: 'Add to Cart',
          onPress: () => {
            // TODO: Add to cart functionality
            Alert.alert('Added', `${product.productName} added to cart`);
          },
        },
      ]
    );
  };

  const renderPrediction = ({ item }: { item: Prediction }) => (
    <TouchableOpacity
      style={styles.predictionCard}
      onPress={() => handleSelectProduct(item)}
    >
      <View style={styles.predictionInfo}>
        <Text style={styles.predictionName}>{item.productName}</Text>
        {item.category && (
          <Text style={styles.predictionCategory}>{item.category}</Text>
        )}
        <Text style={styles.predictionMeta}>
          Price: ₹{item.sellingPrice} | Stock: {item.currentStock}
        </Text>
      </View>
      <View style={styles.confidenceContainer}>
        <Text style={styles.confidenceText}>
          {(item.confidence * 100).toFixed(0)}%
        </Text>
        <Text style={styles.confidenceLabel}>match</Text>
      </View>
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>AI Product Recognition</Text>
        <Text style={styles.subtitle}>
          Take a photo to identify products
        </Text>
      </View>

      {/* Camera Preview */}
      {imageUri ? (
        <Image source={{ uri: imageUri }} style={styles.previewImage} />
      ) : (
        <View style={styles.placeholder}>
          <Text style={styles.placeholderIcon}>📷</Text>
          <Text style={styles.placeholderText}>No image captured</Text>
        </View>
      )}

      {/* Capture Button */}
      <TouchableOpacity style={styles.captureButton} onPress={takePhoto}>
        <Text style={styles.captureButtonText}>
          {imageUri ? '🔄 Retake Photo' : '📸 Take Photo'}
        </Text>
      </TouchableOpacity>

      {/* Processing Indicator */}
      {isProcessing && (
        <View style={styles.processingContainer}>
          <ActivityIndicator size="large" color="#2196F3" />
          <Text style={styles.processingText}>Analyzing image...</Text>
        </View>
      )}

      {/* Predictions */}
      {predictions.length > 0 && (
        <View style={styles.resultsSection}>
          <Text style={styles.resultsTitle}>Matches Found</Text>
          <FlatList
            data={predictions}
            renderItem={renderPrediction}
            keyExtractor={(item) => item.productId}
          />
        </View>
      )}

      {/* Info Section */}
      <View style={styles.infoSection}>
        <Text style={styles.infoTitle}>How it works:</Text>
        <Text style={styles.infoText}>
          • Point camera at product barcode for instant recognition{'\n'}
          • Or take a photo of the product for AI identification{'\n'}
          • Works best with clear, well-lit images{'\n'}
          • Barcode recognition is most accurate
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  header: {
    backgroundColor: '#fff',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
  },
  subtitle: {
    fontSize: 14,
    color: '#666',
    marginTop: 4,
  },
  previewImage: {
    width: '100%',
    height: 200,
    resizeMode: 'cover',
  },
  placeholder: {
    height: 200,
    backgroundColor: '#e0e0e0',
    justifyContent: 'center',
    alignItems: 'center',
  },
  placeholderIcon: {
    fontSize: 48,
  },
  placeholderText: {
    fontSize: 16,
    color: '#999',
    marginTop: 8,
  },
  captureButton: {
    backgroundColor: '#2196F3',
    margin: 16,
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  captureButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  processingContainer: {
    alignItems: 'center',
    padding: 20,
  },
  processingText: {
    marginTop: 12,
    fontSize: 16,
    color: '#666',
  },
  resultsSection: {
    flex: 1,
    paddingHorizontal: 16,
  },
  resultsTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 8,
  },
  predictionCard: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 14,
    marginBottom: 8,
    elevation: 1,
  },
  predictionInfo: {
    flex: 1,
  },
  predictionName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
  },
  predictionCategory: {
    fontSize: 13,
    color: '#666',
    marginTop: 2,
  },
  predictionMeta: {
    fontSize: 13,
    color: '#999',
    marginTop: 4,
  },
  confidenceContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#e8f5e9',
    borderRadius: 8,
    padding: 8,
    minWidth: 60,
  },
  confidenceText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#4CAF50',
  },
  confidenceLabel: {
    fontSize: 11,
    color: '#666',
  },
  infoSection: {
    backgroundColor: '#fff',
    margin: 16,
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  infoTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 8,
  },
  infoText: {
    fontSize: 13,
    color: '#666',
    lineHeight: 20,
  },
});
