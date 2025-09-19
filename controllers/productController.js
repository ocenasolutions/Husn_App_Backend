// server/controllers/productController.js
const Product = require('../models/Product');
const { deleteFromS3 } = require('../config/s3Config');

// Get all products (Public)
exports.getAllProducts = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 12,
      category,
      brand,
      featured,
      minPrice,
      maxPrice,
      search,
      sortBy = 'createdAt',
      sortOrder = 'desc',
      status = 'published', // Changed default from 'published' 
      stockStatus
    } = req.query;

    const query = { isActive: true };
    
    // Handle status filter
    if (status && status !== 'all') {
      query.status = status;
    }
    
    // Handle category filter
    if (category && category !== 'all') {
      query.category = category;
    }
    
    if (brand) {
      query.brand = { $regex: brand, $options: 'i' };
    }
    
    if (featured !== undefined) {
      query.featured = featured === 'true';
    }

    // Handle stock status filter
    if (stockStatus && stockStatus !== 'all') {
      query.stockStatus = stockStatus;
      console.log('Filtering by stock status:', stockStatus);
    }
    
    // Price range filter
    if (minPrice || maxPrice) {
      query.price = {};
      if (minPrice) query.price.$gte = parseFloat(minPrice);
      if (maxPrice) query.price.$lte = parseFloat(maxPrice);
    }

    // Add search functionality
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } },
        { brand: { $regex: search, $options: 'i' } },
        { tags: { $in: [new RegExp(search, 'i')] } }
      ];
    }

    const sortOptions = {};
    sortOptions[sortBy] = sortOrder === 'desc' ? -1 : 1;

    const skip = (page - 1) * limit;

    console.log('Query:', JSON.stringify(query));

    const products = await Product.find(query)
      .populate('createdBy', 'name email')
      .sort(sortOptions)
      .skip(skip)
      .limit(parseInt(limit))
      .lean();

    const total = await Product.countDocuments(query);

    // Debug logging
    console.log(`Found ${products.length} products`);
    if (products.length > 0) {
      console.log('First product stock info:', {
        name: products[0].name,
        stockStatus: products[0].stockStatus,
        stock: products[0].stock
      });
    }

    res.json({
      success: true,
      data: products,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(total / limit),
        totalItems: total,
        hasNext: page * limit < total,
        hasPrev: page > 1
      }
    });

  } catch (error) {
    console.error('Get products error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch products',
      error: error.message
    });
  }
};


// Get featured products (Public)
exports.getFeaturedProducts = async (req, res) => {
  try {
    const { limit = 10 } = req.query;
    
    const featuredProducts = await Product.find({ 
      isActive: true, 
      featured: true,
      status: 'published'
    })
      .populate('createdBy', 'name email')
      .sort({ createdAt: -1 })
      .limit(parseInt(limit))
      .lean();

    res.json({
      success: true,
      data: featuredProducts
    });

  } catch (error) {
    console.error('Get featured products error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch featured products',
      error: error.message
    });
  }
};

// Get products by category (Public)
exports.getProductsByCategory = async (req, res) => {
  try {
    const { category } = req.params;
    const { limit = 20, page = 1 } = req.query;
    
    const skip = (page - 1) * limit;
    
    const products = await Product.find({
      category,
      isActive: true,
      status: 'published'
    })
      .populate('createdBy', 'name email')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .lean();

    const total = await Product.countDocuments({
      category,
      isActive: true,
      status: 'published'
    });

    res.json({
      success: true,
      data: products,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(total / limit),
        totalItems: total,
        hasNext: page * limit < total,
        hasPrev: page > 1
      }
    });

  } catch (error) {
    console.error('Get products by category error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch products by category',
      error: error.message
    });
  }
};

// Get single product (Public)
exports.getProductById = async (req, res) => {
  try {
    const { id } = req.params;

    const product = await Product.findOne({ 
      _id: id, 
      isActive: true,
      status: 'published' 
    })
      .populate('createdBy', 'name email')
      .lean();

    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'Product not found'
      });
    }

    // Increment views
    await Product.findByIdAndUpdate(id, { $inc: { views: 1 } });
    product.views = (product.views || 0) + 1;

    res.json({
      success: true,
      data: product
    });

  } catch (error) {
    console.error('Get product error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch product',
      error: error.message
    });
  }
};

// Create/Upload product (Admin only)
exports.createProduct = async (req, res) => {
  try {
    const {
      name,
      description,
      category,
      brand,
      price,
      originalPrice,
      stock,
      stockStatus,
      tags,
      featured,
      variants,
      status,
      imageUrls
    } = req.body;

    console.log('Create product request body:', req.body);
    console.log('Stock status received:', stockStatus);
    console.log('Stock quantity received:', stock);
    console.log('Uploaded files:', req.files);

    // Validation
    if (!name || !price || !category) {
      return res.status(400).json({
        success: false,
        message: 'Name, price, and category are required'
      });
    }

    // Parse stock quantity
    const stockQuantity = parseInt(stock) || 0;
    
    // Determine stock status - use provided status or auto-calculate
    let finalStockStatus = stockStatus || 'in-stock';
    
    // Auto-calculate if not explicitly provided or if stock is 0
    if (!stockStatus || stockQuantity === 0) {
      if (stockQuantity === 0) {
        finalStockStatus = 'out-of-stock';
      } else if (stockQuantity <= 5) {
        finalStockStatus = 'low-stock';
      } else {
        finalStockStatus = 'in-stock';
      }
    }

    // Validate stock status
    const validStatuses = ['in-stock', 'low-stock', 'out-of-stock'];
    if (!validStatuses.includes(finalStockStatus)) {
      finalStockStatus = 'in-stock'; // Default fallback
    }

    console.log('Final stock status:', finalStockStatus);
    console.log('Final stock quantity:', stockQuantity);

    const productData = {
      name: name.trim(),
      description: description ? description.trim() : '',
      category,
      brand: brand || '',
      price: parseFloat(price),
      originalPrice: originalPrice ? parseFloat(originalPrice) : null,
      currency: 'INR',
      stock: stockQuantity,
      stockStatus: finalStockStatus, // Ensure this is set
      featured: featured === 'true' || featured === true,
      status: status || 'published',
      createdBy: req.user._id,
      isActive: true,
      images: []
    };

    // Handle tags
    if (tags && tags.trim()) {
      productData.tags = tags.split(',').map(tag => tag.trim()).filter(tag => tag.length > 0);
    }

    // Handle variants
    if (variants) {
      try {
        productData.variants = typeof variants === 'string' 
          ? JSON.parse(variants) 
          : variants;
      } catch (e) {
        console.error('Error parsing variants:', e);
        productData.variants = [];
      }
    }

    // Handle uploaded images (files)
    if (req.files && req.files.length > 0) {
      productData.images = req.files.map((file, index) => ({
        url: file.location,
        key: file.key,
        alt: `${name} - Image ${index + 1}`,
        isPrimary: index === 0
      }));
      
      productData.primaryImage = req.files[0].location;
    }

    // Handle URL-based images
    if (imageUrls && imageUrls.length > 0) {
      const urlImages = imageUrls.map((url, index) => ({
        url: url.trim(),
        alt: `${name} - Image ${index + 1}`,
        isPrimary: index === 0 && productData.images.length === 0
      }));
      
      productData.images = [...productData.images, ...urlImages];
      
      if (!productData.primaryImage && urlImages.length > 0) {
        productData.primaryImage = urlImages[0].url;
      }
    }

    console.log('Creating product with data:', {
      ...productData,
      stockStatus: productData.stockStatus,
      stock: productData.stock
    });

    const product = new Product(productData);
    await product.save();

    await product.populate('createdBy', 'name email');

    console.log('Product saved with stock status:', product.stockStatus);

    res.status(201).json({
      success: true,
      message: 'Product created successfully',
      data: product
    });

  } catch (error) {
    console.error('Create product error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create product',
      error: error.message
    });
  }
};

// Update product (Admin only)
exports.updateProduct = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      name,
      description,
      category,
      brand,
      price,
      originalPrice,
      stock,
      stockStatus,
      tags,
      featured,
      variants,
      status,
      isActive,
      imageUrls
    } = req.body;

    const product = await Product.findById(id);
    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'Product not found'
      });
    }

    // Update fields
    if (name) product.name = name.trim();
    if (description !== undefined) product.description = description.trim();
    if (category) product.category = category;
    if (brand !== undefined) product.brand = brand;
    if (price !== undefined) product.price = parseFloat(price);
    if (originalPrice !== undefined) product.originalPrice = originalPrice ? parseFloat(originalPrice) : null;
    if (stock !== undefined) product.stock = parseInt(stock);
    if (stockStatus) product.stockStatus = stockStatus;
    if (featured !== undefined) product.featured = featured === 'true' || featured === true;
    if (status) product.status = status;
    if (isActive !== undefined) product.isActive = isActive === 'true' || isActive === true;

    // Handle tags
    if (tags !== undefined) {
      product.tags = tags ? tags.split(',').map(tag => tag.trim()).filter(tag => tag.length > 0) : [];
    }

    // Handle variants
    if (variants !== undefined) {
      try {
        product.variants = typeof variants === 'string' 
          ? JSON.parse(variants) 
          : variants;
      } catch (e) {
        console.error('Error parsing variants:', e);
      }
    }

    // Handle new image uploads
    if (req.files && req.files.length > 0) {
      const newImages = req.files.map((file, index) => ({
        url: file.location,
        key: file.key,
        alt: `${product.name} - Image ${product.images.length + index + 1}`,
        isPrimary: product.images.length === 0 && index === 0
      }));
      
      product.images = [...product.images, ...newImages];
      
      if (!product.primaryImage && newImages.length > 0) {
        product.primaryImage = newImages[0].url;
      }
    }

    // Handle URL-based images
    if (imageUrls && imageUrls.length > 0) {
      const urlImages = imageUrls.map((url, index) => ({
        url: url.trim(),
        alt: `${product.name} - Image ${product.images.length + index + 1}`,
        isPrimary: product.images.length === 0 && index === 0
      }));
      
      product.images = [...product.images, ...urlImages];
      
      if (!product.primaryImage && urlImages.length > 0) {
        product.primaryImage = urlImages[0].url;
      }
    }

    product.updatedBy = req.user._id;
    product.updatedAt = new Date();

    await product.save();
    await product.populate('createdBy', 'name email');

    res.json({
      success: true,
      message: 'Product updated successfully',
      data: product
    });

  } catch (error) {
    console.error('Update product error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update product',
      error: error.message
    });
  }
};

// Delete product (Admin only)
exports.deleteProduct = async (req, res) => {
  try {
    const { id } = req.params;

    const product = await Product.findById(id);
    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'Product not found'
      });
    }

    // Delete images from S3 if they have keys
    try {
      for (const image of product.images) {
        if (image.key) {
          await deleteFromS3(image.key);
        }
      }
    } catch (error) {
      console.error('Error deleting images from S3:', error);
    }

    await Product.findByIdAndDelete(id);

    res.json({
      success: true,
      message: 'Product deleted successfully'
    });

  } catch (error) {
    console.error('Delete product error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete product',
      error: error.message
    });
  }
};

// Get product categories (Public)
exports.getProductCategories = async (req, res) => {
  try {
    const categories = await Product.distinct('category', { isActive: true });
    
    res.json({
      success: true,
      data: categories
    });

  } catch (error) {
    console.error('Get categories error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch categories',
      error: error.message
    });
  }
};

// Get product brands (Public)
exports.getProductBrands = async (req, res) => {
  try {
    const brands = await Product.distinct('brand', { 
      isActive: true, 
      brand: { $ne: '' } 
    });
    
    res.json({
      success: true,
      data: brands
    });

  } catch (error) {
    console.error('Get brands error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch brands',
      error: error.message
    });
  }
};

// Toggle product status (Admin only)
exports.toggleProductStatus = async (req, res) => {
  try {
    const { id } = req.params;

    const product = await Product.findById(id);
    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'Product not found'
      });
    }

    product.isActive = !product.isActive;
    product.updatedBy = req.user._id;
    product.updatedAt = new Date();
    await product.save();

    res.json({
      success: true,
      message: `Product ${product.isActive ? 'activated' : 'deactivated'} successfully`,
      data: product
    });

  } catch (error) {
    console.error('Toggle product status error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to toggle product status',
      error: error.message
    });
  }
};

// Update product status (Admin only)
exports.updateProductStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!['draft', 'published', 'archived'].includes(status)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid status value'
      });
    }

    const product = await Product.findById(id);
    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'Product not found'
      });
    }

    product.status = status;
    product.updatedBy = req.user._id;
    product.updatedAt = new Date();
    await product.save();

    res.json({
      success: true,
      message: `Product status updated to ${status}`,
      data: product
    });

  } catch (error) {
    console.error('Update product status error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update product status',
      error: error.message
    });
  }
};

// Update stock status (Admin only) - NEW CONTROLLER
exports.updateStockStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { stockStatus } = req.body;

    console.log('Updating stock status for product:', id, 'to:', stockStatus);

    if (!['in-stock', 'low-stock', 'out-of-stock'].includes(stockStatus)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid stock status value. Must be: in-stock, low-stock, or out-of-stock'
      });
    }

    const product = await Product.findById(id);
    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'Product not found'
      });
    }

    const oldStockStatus = product.stockStatus;
    
    product.stockStatus = stockStatus;
    product.updatedBy = req.user._id;
    product.updatedAt = new Date();
    
    await product.save();

    console.log(`Stock status updated from ${oldStockStatus} to ${product.stockStatus}`);

    res.json({
      success: true,
      message: `Stock status updated from ${oldStockStatus} to ${stockStatus}`,
      data: {
        id: product._id,
        stockStatus: product.stockStatus,
        stock: product.stock,
        updatedAt: product.updatedAt
      }
    });

  } catch (error) {
    console.error('Update stock status error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update stock status',
      error: error.message
    });
  }
};

exports.applyOfferToProduct = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      offerTitle,
      offerDescription,
      offerDiscount,
      offerStartDate,
      offerEndDate
    } = req.body;

    console.log('Applying offer to product:', id, req.body);

    // Validation
    if (!offerTitle || !offerDiscount || !offerEndDate) {
      return res.status(400).json({
        success: false,
        message: 'Offer title, discount, and end date are required'
      });
    }

    const discount = parseFloat(offerDiscount);
    if (discount < 1 || discount > 90) {
      return res.status(400).json({
        success: false,
        message: 'Offer discount must be between 1% and 90%'
      });
    }

    const product = await Product.findById(id);
    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'Product not found'
      });
    }

    // Calculate offer price
    const offerPrice = Math.round(product.price * (1 - discount / 100));

    // Set offer data
    product.offerActive = true;
    product.offerTitle = offerTitle;
    product.offerDescription = offerDescription || '';
    product.offerDiscount = discount;
    product.offerPrice = offerPrice;
    product.offerStartDate = offerStartDate ? new Date(offerStartDate) : new Date();
    product.offerEndDate = new Date(offerEndDate);
    product.updatedBy = req.user._id;
    product.updatedAt = new Date();

    await product.save();

    console.log('Offer applied successfully to product:', product.name);

    res.json({
      success: true,
      message: 'Offer applied successfully',
      data: {
        id: product._id,
        name: product.name,
        originalPrice: product.price,
        offerPrice: product.offerPrice,
        offerDiscount: product.offerDiscount,
        offerTitle: product.offerTitle,
        offerEndDate: product.offerEndDate
      }
    });

  } catch (error) {
    console.error('Apply offer to product error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to apply offer',
      error: error.message
    });
  }
};

// Remove offer from product (Admin only)
exports.removeOfferFromProduct = async (req, res) => {
  try {
    const { id } = req.params;

    const product = await Product.findById(id);
    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'Product not found'
      });
    }

    if (!product.offerActive) {
      return res.status(400).json({
        success: false,
        message: 'No active offer found on this product'
      });
    }

    // Remove offer data
    product.offerActive = false;
    product.offerTitle = undefined;
    product.offerDescription = undefined;
    product.offerDiscount = undefined;
    product.offerPrice = undefined;
    product.offerStartDate = undefined;
    product.offerEndDate = undefined;
    product.updatedBy = req.user._id;
    product.updatedAt = new Date();

    await product.save();

    console.log('Offer removed from product:', product.name);

    res.json({
      success: true,
      message: 'Offer removed successfully',
      data: {
        id: product._id,
        name: product.name,
        price: product.price
      }
    });

  } catch (error) {
    console.error('Remove offer from product error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to remove offer',
      error: error.message
    });
  }
};

// Get products with active offers (Admin only)
exports.getProductsWithOffers = async (req, res) => {
  try {
    const { page = 1, limit = 50 } = req.query;
    
    const skip = (page - 1) * limit;
    
    const products = await Product.find({ 
      offerActive: true,
      isActive: true
    })
      .populate('createdBy', 'name email')
      .sort({ offerEndDate: 1 }) // Sort by offer end date (earliest first)
      .skip(skip)
      .limit(parseInt(limit))
      .lean();

    const total = await Product.countDocuments({ 
      offerActive: true,
      isActive: true 
    });

    console.log(`Found ${products.length} products with active offers`);

    res.json({
      success: true,
      data: products,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(total / limit),
        totalItems: total,
        hasNext: page * limit < total,
        hasPrev: page > 1
      }
    });

  } catch (error) {
    console.error('Get products with offers error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch products with offers',
      error: error.message
    });
  }
};

// Get all products for offer management (Admin only)
exports.getAllProductsForOffers = async (req, res) => {
  try {
    const { page = 1, limit = 100 } = req.query;
    
    const skip = (page - 1) * limit;
    
    const products = await Product.find({ 
      isActive: true,
      status: 'published'
    })
      .populate('createdBy', 'name email')
      .sort({ offerActive: -1, createdAt: -1 }) // Products with offers first, then by creation date
      .skip(skip)
      .limit(parseInt(limit))
      .lean();

    const total = await Product.countDocuments({ 
      isActive: true,
      status: 'published'
    });

    const activeOffersCount = await Product.countDocuments({
      offerActive: true,
      isActive: true
    });

    console.log(`Found ${products.length} products, ${activeOffersCount} with active offers`);

    res.json({
      success: true,
      data: products,
      stats: {
        totalProducts: total,
        activeOffers: activeOffersCount
      },
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(total / limit),
        totalItems: total,
        hasNext: page * limit < total,
        hasPrev: page > 1
      }
    });

  } catch (error) {
    console.error('Get all products for offers error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch products',
      error: error.message
    });
  }
};