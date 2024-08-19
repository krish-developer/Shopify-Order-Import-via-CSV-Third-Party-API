const csv = require('csvtojson');
const axios = require('axios');

// Path to CSV to be imported
const CSV_FILE_PATH = './orders.csv';

// Shopify store credentials
const { SHOPIFY_STORE_HANDLE, SHOPIFY_ACCESS_TOKEN } = process.env;

// Custom note or tag to add to each imported order
const ORDER_NOTE ='IMPORTED ORDER';
const ORDER_TAG = 'IMPORTED';

(async () => {
  // Import orders from CSV
  await importOrdersFromCSV(CSV_FILE_PATH);

  // Import orders from Third-Party API
  const thirdPartyApiUrl = 'https://example.com/api/orders';
  await importOrdersFromAPI(thirdPartyApiUrl);
})();

async function importOrdersFromCSV(filePath) {
  try {
    const records = await csv().fromFile(filePath);

    if (!records || records.length === 0) {
      throw new Error(`Couldn't read records from CSV ${filePath}`);
    }

    console.log(`Read ${records.length} records from CSV ${filePath}`);

    const orders = processRecords(records);

    await uploadOrdersToShopify(orders);
  } catch (error) {
    console.error('Error during CSV order processing:', error.message);
  }
}

async function importOrdersFromAPI(apiUrl) {
  try {
    const { data: records } = await axios.get(apiUrl);

    if (!records || records.length === 0) {
      throw new Error(`No records retrieved from API ${apiUrl}`);
    }

    console.log(`Retrieved ${records.length} records from API ${apiUrl}`);

    const orders = processRecords(records);

    await uploadOrdersToShopify(orders);
  } catch (error) {
    console.error('Error during API order processing:', error.message);
  }
}

function processRecords(records) {
  const orders = {};

  records.forEach(record => {
    const orderName = record.email.replace(/[^\w]+/g, '_');

    if (!orders[orderName]) {
      orders[orderName] = {
        imported: false,
        order_name: orderName,
        email: record.email,
        phone: record.phone,
        billing_name: record.billing_name,
        billing_company: record.company,
        billing_address1: record.billing_address1,
        billing_address2: record.billing_address2 || null,
        billing_city: record.billing_city,
        billing_zip: record.billing_zip,
        billing_province: record.billing_province && record.billing_province.length === 2 ?
          record.billing_province : null,
        billing_country: record.billing_country,
        line_items: [
          {
            title: record.lineitem_title,
            sku: record.lineitem_sku,
            price: 0.00,
            quantity: parseInt(record.lineitem_quantity)
          }
        ],
        shipping_method: record.shipping_method,
        tags: ORDER_TAG,
        note_attributes: record.note_attributes
      };
    } else {
      orders[orderName].line_items.push({
        title: record.lineitem_title,
        sku: record.lineitem_sku,
        price: 0.00,
        quantity: parseInt(record.lineitem_quantity)
      });
    }
  });

  return Object.values(orders).filter(order => !order.imported);
}

async function uploadOrdersToShopify(ordersArr) {
  for (let i = 0; i < ordersArr.length; i++) {
    const order = ordersArr[i];
    console.log(`Uploading order ${i + 1}/${ordersArr.length} to Shopify`);

    const customer = {
      name: order.billing_name,
      email: order.email,
      phone: order.phone
    };

    const address = {
      name: customer.name,
      address1: order.billing_address1,
      address2: order.billing_address2,
      phone: order.phone,
      city: order.billing_city,
      zip: order.billing_zip,
      province_code: order.billing_province,
      country_code: order.billing_country
    };

    const shipping = {
      title: order.shipping_method,
      code: order.shipping_method,
      price: 0.00
    };

    const shopifyOrder = {
      order: {
        customer,
        billing_address: address,
        shipping_address: address,
        financial_status: 'paid',
        fulfillment_status: null,
        processing_method: 'manual',
        send_fulfillment_receipt: false,
        send_receipt: false,
        line_items: order.line_items.map(item => ({
          title: item.title,
          sku: item.sku,
          price: 0.00,
          quantity: item.quantity
        })),
        shipping_lines: [shipping],
        tags: order.tags,
        note: order.note_attributes ? ORDER_NOTE + order.note_attributes : ''
      }
    };

    try {
      const result = await uploadOrderToShopify(shopifyOrder);
      console.log(`Uploaded order ${i + 1}/${ordersArr.length} to Shopify: ${result.name}`);
    } catch (error) {
      console.error(`Failed to upload order ${i + 1}/${ordersArr.length}:`, error.response?.data || error.message);
    }

    await sleep(1000); // To avoid hitting API rate limits
  }
}


async function uploadOrderToShopify(order) {
  const url = `https://${SHOPIFY_STORE_HANDLE}.myshopify.com/admin/api/2023-07/orders.json`;

  const config = {
    method: 'POST',
    url,
    headers: {
      'X-Shopify-Access-Token': SHOPIFY_ACCESS_TOKEN,
      'Content-Type': 'application/json'
    },
    data: order
  };

  const response = await axios(config);
  return response.data.order;
}

