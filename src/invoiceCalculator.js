/**
 * Invoice & Profit Calculation Engine (matching C:\INVOICE\calculator.py)
 * 
 * Auto-calculates prices for 25% profit margin over wholesaler bill (after 18% GST).
 * 
 * Pricing Formula:
 *   1. Target Incl. GST = Wholesale Cost × 1.25 (25% margin over wholesale)
 *   2. Unit Price Excl. Tax = ROUND(Target Incl. GST / 1.18) -> Clean rounded integer (e.g. ₹102)
 *   3. Unit Price Incl. GST = Unit Price Excl. Tax × 1.18 -> Taxed decimal (e.g. ₹120.36)
 *   4. Line Total = Qty × Unit Price Incl. GST
 *   5. Subtotal = SUM(Qty × Unit Price Excl. Tax)
 *   6. Total GST = Subtotal × 18%
 *   7. Delivery Rule: If (Subtotal + GST) < ₹700, add ₹50 delivery fee (otherwise Free Delivery)
 *   8. Round Off = ROUND(Subtotal + GST + Delivery) - (Subtotal + GST + Delivery)
 *   9. Grand Total = Subtotal + GST + Delivery + Round Off (clean integer)
 */

export function calculateInvoice(items = [], deliveryParams = {}, metadata = {}) {
  const delivery = {
    deliveryService: deliveryParams.deliveryService || "Direct Handover / Self Pickup",
    paidDeliveryFee: parseFloat(deliveryParams.paidDeliveryFee) || 0,
    packagingMisc: parseFloat(deliveryParams.packagingMisc) || 0,
    customerDeliveryFeeAmount: parseFloat(deliveryParams.customerDeliveryFeeAmount !== undefined ? deliveryParams.customerDeliveryFeeAmount : 50),
    deliveryThreshold: parseFloat(deliveryParams.deliveryThreshold !== undefined ? deliveryParams.deliveryThreshold : 700)
  };

  let subtotal = 0;
  let totalWholesaleCost = 0;
  const calculatedItems = [];

  for (const item of items) {
    const qty = parseInt(item.quantity || item.qty, 10) || 1;
    const wholesaleUnitCost = parseFloat(item.wholesale_unit_cost !== undefined ? item.wholesale_unit_cost : (item.wholesaleCost || 0));
    const gstRate = parseFloat(item.gst_rate !== undefined ? item.gst_rate : 0.18);

    // Step 1: Pre-tax price is a rounded integer.
    // If not manually specified, calculate from wholesale with 25% target margin:
    let unitPriceExclTax = parseFloat(item.unit_price_excl_tax !== undefined ? item.unit_price_excl_tax : (item.unitPriceExclTax || 0));
    if (unitPriceExclTax <= 0 && wholesaleUnitCost > 0) {
      const targetIncl = wholesaleUnitCost * 1.25;
      unitPriceExclTax = Math.round(targetIncl / (1.0 + gstRate));
    } else {
      unitPriceExclTax = Math.round(unitPriceExclTax);
    }

    // Step 2: Unit Price Incl. GST
    const unitPriceInclGst = parseFloat((unitPriceExclTax * (1.0 + gstRate)).toFixed(2));

    // Step 3: Line totals
    const lineTotalExclTax = parseFloat((unitPriceExclTax * qty).toFixed(2));
    const lineTotal = parseFloat((qty * unitPriceInclGst).toFixed(2));

    subtotal += lineTotalExclTax;

    // Step 4: Wholesale cost and gross profit per item
    const wholesaleTotal = parseFloat((qty * wholesaleUnitCost).toFixed(2));
    const grossProfit = parseFloat((lineTotal - wholesaleTotal).toFixed(2));

    const marginOnWholesale = wholesaleTotal > 0 ? parseFloat(((grossProfit / wholesaleTotal) * 100).toFixed(2)) : 0;
    const marginOnSelling = lineTotal > 0 ? parseFloat(((grossProfit / lineTotal) * 100).toFixed(2)) : 0;

    totalWholesaleCost += wholesaleTotal;

    calculatedItems.push({
      name: item.name || item.description || 'Component',
      quantity: qty,
      wholesale_unit_cost: wholesaleUnitCost,
      unit_price_excl_tax: unitPriceExclTax,
      gst_rate: gstRate,
      unit_price_incl_gst: unitPriceInclGst,
      line_total_excl_tax: lineTotalExclTax,
      line_total: lineTotal,
      wholesale_total: wholesaleTotal,
      gross_profit: grossProfit,
      net_margin_pct: marginOnWholesale,
      net_margin_on_selling_pct: marginOnSelling
    });
  }

  subtotal = parseFloat(subtotal.toFixed(2));
  const totalGst = parseFloat((subtotal * 0.18).toFixed(2));

  // Delivery Rule: If product bill (subtotal + GST) < ₹700, add delivery fee
  const productBill = parseFloat((subtotal + totalGst).toFixed(2));
  let deliveryFeeCharged = 0;
  if (productBill > 0 && productBill < delivery.deliveryThreshold) {
    deliveryFeeCharged = delivery.customerDeliveryFeeAmount;
  }

  // Round Off to nearest rupee
  const preRoundTotal = parseFloat((productBill + deliveryFeeCharged).toFixed(2));
  const grandTotal = Math.round(preRoundTotal);
  const roundOff = parseFloat((grandTotal - preRoundTotal).toFixed(2));

  // Internal Profit Analysis
  totalWholesaleCost = parseFloat(totalWholesaleCost.toFixed(2));
  const grossProfitFromProducts = parseFloat(calculatedItems.reduce((sum, i) => sum + i.gross_profit, 0).toFixed(2));
  const deliveryExpense = parseFloat((delivery.paidDeliveryFee + delivery.packagingMisc).toFixed(2));
  const finalNetProfit = parseFloat((grossProfitFromProducts - deliveryExpense + deliveryFeeCharged).toFixed(2));

  const finalNetMarginOnWholesalePct = totalWholesaleCost > 0
    ? parseFloat(((finalNetProfit / totalWholesaleCost) * 100).toFixed(2))
    : 0;

  const finalNetMarginOnRevenuePct = grandTotal > 0
    ? parseFloat(((finalNetProfit / grandTotal) * 100).toFixed(2))
    : 0;

  return {
    items: calculatedItems,
    customer: {
      subtotal,
      total_gst: totalGst,
      delivery_fee: deliveryFeeCharged,
      is_free_delivery: deliveryFeeCharged === 0 && productBill >= delivery.deliveryThreshold,
      product_bill: productBill,
      round_off: roundOff,
      grand_total: grandTotal
    },
    internal: {
      total_wholesale_cost: totalWholesaleCost,
      gross_profit_products: grossProfitFromProducts,
      delivery_expense: deliveryExpense,
      delivery_fee_charged: deliveryFeeCharged,
      final_net_profit: finalNetProfit,
      final_net_margin_on_wholesale_pct: finalNetMarginOnWholesalePct,
      final_net_margin_on_revenue_pct: finalNetMarginOnRevenuePct
    },
    delivery,
    metadata: {
      customer_name: metadata.customer_name || metadata.customerName || "Customer",
      phone: metadata.phone || metadata.customerPhone || "N/A",
      delivery_address: metadata.delivery_address || metadata.customerAddress || "N/A",
      order_notes: metadata.order_notes || metadata.notes || "",
      invoice_no: metadata.invoice_no || metadata.invoiceNumber || generateDefaultInvoiceNo(),
      invoice_date: metadata.invoice_date || metadata.date || new Date().toISOString().split('T')[0],
      order_type: metadata.order_type || metadata.orderType || "Component Order",
      payment_status: metadata.payment_status || metadata.paymentStatus || "Pending"
    }
  };
}

export function generateDefaultInvoiceNo() {
  const date = new Date();
  const year = date.getFullYear().toString().slice(-2);
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const random = Math.floor(1000 + Math.random() * 9000);
  return `INV-${year}${month}-${random}`;
}

/**
 * Convert number to Indian currency words
 */
export function numberToWords(num) {
  const a = ['', 'One ', 'Two ', 'Three ', 'Four ', 'Five ', 'Six ', 'Seven ', 'Eight ', 'Nine ', 'Ten ', 'Eleven ', 'Twelve ', 'Thirteen ', 'Fourteen ', 'Fifteen ', 'Sixteen ', 'Seventeen ', 'Eighteen ', 'Nineteen '];
  const b = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

  const n = Math.floor(Math.abs(num));
  if (n === 0) return 'Zero Rupees Only';

  function convertSection(val) {
    let str = '';
    if (val > 99) {
      str += a[Math.floor(val / 100)] + 'Hundred ';
      val %= 100;
    }
    if (val > 19) {
      str += b[Math.floor(val / 10)] + ' ' + a[val % 10];
    } else if (val > 0) {
      str += a[val];
    }
    return str;
  }

  let str = '';
  const crore = Math.floor(n / 10000000);
  let remainder = n % 10000000;
  const lakh = Math.floor(remainder / 100000);
  remainder %= 100000;
  const thousand = Math.floor(remainder / 1000);
  remainder %= 1000;

  if (crore > 0) str += convertSection(crore) + 'Crore ';
  if (lakh > 0) str += convertSection(lakh) + 'Lakh ';
  if (thousand > 0) str += convertSection(thousand) + 'Thousand ';
  if (remainder > 0) str += convertSection(remainder);

  return str.trim() + ' Rupees Only';
}
