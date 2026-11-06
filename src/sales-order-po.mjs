export const hasNoPO=order=>order?.delivery_details?.no_po===true;
export const purchaseOrderLabel=(order,lang='th')=>hasNoPO(order)?(lang==='th'?"ไม่มี ใบสั่งซื้อ":'No PO'):(order?.po_number||'—');
