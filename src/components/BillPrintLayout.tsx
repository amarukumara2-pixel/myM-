import React from 'react';

export function BillPrintLayout({ previewSale, orgSettings }: { previewSale: any, orgSettings: any }) {
  console.log("BillPrintLayout previewSale:", previewSale);
  const salesItems = (Array.isArray(previewSale.items) ? previewSale.items : []).filter((i: any) => !i.isReturn);
  const returnItems = (Array.isArray(previewSale.items) ? previewSale.items : []).filter((i: any) => i.isReturn);
  console.log("DEBUG: previewSale.items:", previewSale.items);
  
  const subTotalAmount = salesItems.reduce((acc: number, c: any) => acc + (c.isSample ? 0 : Number(c.price) * (Number(c.qty) || 0)), 0);
  const returnAmount = returnItems.reduce((acc: number, c: any) => acc + (Number(c.price) * (Number(c.qty) || 0)), 0);
  const discountRs = ((subTotalAmount - returnAmount) * (Number(previewSale.invoiceDiscount) || 0)) / 100;
  
  const isCreditMode = previewSale.mode === 'credit';
  const hasNoPreviousDebt = (Number(previewSale.previousBalance || 0) + Number(previewSale.initialCredit || 0)) === 0;
  const isCashOrCheque = previewSale.paymentType === 'Cash' || previewSale.paymentType === 'Cheque' || previewSale.paymentType === 'Cash + Cheque';
  const showSimpleEnd = hasNoPreviousDebt && isCashOrCheque;

  return (
    <div style={{ 
      width: orgSettings.printerSize === '80' ? '576px' : '384px', 
      color: '#111', 
      fontFamily: '"Helvetica Neue", Helvetica, Arial, sans-serif', 
      boxSizing: 'border-box', 
      fontSize: `${Math.round(((orgSettings.printerFontSize || 13) - 2.5) * 1.75)}px`, 
      fontWeight: orgSettings.printerFontWeight || 400,
      backgroundColor: '#ffffff',
      paddingLeft: '2px',
      paddingRight: '2px',
      paddingTop: '8px',
      position: 'relative',
      overflow: 'visible',
      boxShadow: 'none',
      filter: 'grayscale(100%)'
    }}>
      <div style={{ textAlign: 'center', marginBottom: '6px', color: '#000' }}>
        <h2 style={{ fontSize: '35px', margin: '4px 0 2px 0', fontWeight: 'bold' }}>{orgSettings.name || 'MYM BIZFLOW'}</h2>
        {orgSettings.address && <p style={{ margin: '1px 0', fontSize: '18px' }}>{orgSettings.address}</p>}
        <div style={{ margin: '6px 0', fontWeight: 'bold', border: '1px solid #000', padding: '4px' }}>
          Hotline: {orgSettings.phone}
        </div>
      </div>
      
      <div style={{ borderTop: '1px solid #000', margin: '6px 0' }}></div>

      <table style={{ width: '100%', fontSize: '18px', lineHeight: '1.2' }}>
        <tbody>
          <tr>
            <td style={{ verticalAlign: 'top' }}>
              <strong>To:</strong> {String(previewSale.customer || 'CASH CUSTOMER').toUpperCase()}<br/>
              {previewSale.address && <span>{previewSale.address}</span>}
            </td>
            <td style={{ verticalAlign: 'top', textAlign: 'right' }}>
              Date: {new Date(previewSale.createdAt).toLocaleDateString()}<br/>
              Inv: #{previewSale.id.replace('INV-', '').replace('CR-', '').substring(0, 6)}<br/>
              <strong>
                {previewSale.paymentType === 'Credit' 
                  ? 'CREDIT / ණය' 
                  : previewSale.paymentType === 'Cash + Cheque' 
                  ? 'CASH + CHEQUE / මුදල් + චෙක්' 
                  : previewSale.paymentType === 'Cheque' 
                  ? 'CHEQUE / චෙක්පත්' 
                  : 'CASH / මුදල්'}
              </strong>
            </td>
          </tr>
        </tbody>
      </table>

      <div style={{ borderBottom: '1px solid #000', margin: '6px 0 4px 0' }}></div>

      {salesItems.length > 0 && (
          <table style={{ width: '100%', fontSize: `${(orgSettings.printerFontSize || 13) - 3}px`, borderCollapse: 'collapse', color: '#222' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #000' }}>
                <th style={{ textAlign: 'left', padding: '2px 0', width: '12%', fontSize: '16px', fontWeight: 'bold' }}>QTY</th>
                <th style={{ textAlign: 'left', padding: '2px 0', width: '48%', fontSize: '16px', fontWeight: 'bold' }}>ITEM NAME / විස්තරය</th>
                <th style={{ textAlign: 'right', padding: '2px 0', width: '20%', fontSize: '16px', fontWeight: 'bold' }}>PRICE</th>
                <th style={{ textAlign: 'right', padding: '2px 0', width: '20%', fontSize: '16px', fontWeight: 'bold' }}>AMOUNT</th>
              </tr>
            </thead>
            <tbody>
              {salesItems.map((c: any, idx: number) => (
                <React.Fragment key={idx}>
                  <tr style={{ borderBottom: c.freeQty > 0 || c.isSample ? 'none' : '1px dashed #ddd' }}>
                    <td style={{ padding: '2px 0', fontWeight: 'normal', verticalAlign: 'top' }}>{c.qty}</td>
                    <td style={{ padding: '2px 0', fontWeight: 'normal' }}>
                      {c.isSample ? '[S] ' : ''}{c.name}
                    </td>
                    <td style={{ textAlign: 'right', padding: '2px 0', fontSize: '16px', opacity: 0.8 }}>{(Number(c.price)).toFixed(2)}</td>
                    <td style={{ textAlign: 'right', padding: '2px 0', fontWeight: '900', fontSize: '21px', verticalAlign: 'top' }}>{c.isSample ? '0.00' : (Number(c.qty) * Number(c.price)).toFixed(2)}</td>
                  </tr>
                  {c.freeQty > 0 && (
                    <tr style={{ borderBottom: '1px dashed #666' }}>
                      <td style={{ padding: '0 0 2px 0', fontSize: '15px', fontStyle: 'italic', color: '#555', fontWeight: 'normal' }}>
                        +{c.freeQty}
                      </td>
                      <td colSpan={3} style={{ padding: '0 0 2px 0', fontSize: '15px', fontStyle: 'italic', color: '#555', fontWeight: 'normal' }}>
                        FREE UNITS (නොමිලේ ලැබුණු ඒකක)
                      </td>
                    </tr>
                  )}
                  {c.isSample && (
                    <tr style={{ borderBottom: '1px dashed #666' }}>
                      <td colSpan={4} style={{ padding: '0 0 2px 0', fontSize: '15px', fontStyle: 'italic', color: '#555', fontWeight: 'normal' }}>
                        * Sample Value: Rs {(Number(c.qty) * Number(c.price)).toFixed(2)}
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
            </tbody>
          </table>
      )}

      {previewSale.mode === 'credit' ? (
        <div style={{ padding: '8px 2px', fontSize: '19px', color: '#333' }}>
          <div style={{ textAlign: 'center', marginBottom: '12px', fontWeight: 'bold', fontSize: '20px', borderBottom: '1px dashed #000', paddingBottom: '6px' }}>
            CREDIT SETTLEMENT / ණය පියවීම් ලැබුණි
          </div>
          
          <table style={{ width: '100%', fontSize: '18px', lineHeight: '1.6', color: '#333', borderCollapse: 'collapse' }}>
            <tbody>
              <tr>
                <td style={{ fontWeight: 'normal', padding: '2px 0' }}>කලින් තිබූ ණය (Previous Balance)</td>
                <td style={{ textAlign: 'right', fontWeight: 'bold', padding: '2px 0' }}>
                  Rs. {Number(previewSale.previousBalance || 0).toFixed(2)}
                </td>
              </tr>
              {previewSale.initialCredit > 0 && (
                <tr>
                  <td style={{ fontWeight: 'normal', padding: '2px 0' }}>ආරම්භක ණය (Initial Credit)</td>
                  <td style={{ textAlign: 'right', fontWeight: 'bold', padding: '2px 0' }}>
                    + Rs. {Number(previewSale.initialCredit || 0).toFixed(2)}
                  </td>
                </tr>
              )}
              <tr style={{ color: '#10b981' }}>
                <td style={{ fontWeight: 'normal', padding: '2px 0' }}>අද ලැබුණු ගෙවීම (Payment Received)</td>
                <td style={{ textAlign: 'right', fontWeight: 'bold', padding: '2px 0' }}>
                  - Rs. {Number(previewSale.creditReceivedAmount || 0).toFixed(2)}
                </td>
              </tr>
              <tr style={{ borderTop: '2px solid #000', backgroundColor: '#000', color: '#fff' }}>
                <td style={{ fontWeight: 'bold', paddingTop: '10px', paddingBottom: '10px', paddingLeft: '6px', fontSize: '26px' }}>ණය ශේෂය (Final Balance)</td>
                <td style={{ textAlign: 'right', fontWeight: '900', paddingTop: '10px', paddingBottom: '10px', paddingRight: '6px', fontSize: '39px' }}>
                  Rs. {Number(previewSale.newBalance || 0).toFixed(2)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      ) : (
        <>
          <div style={{ borderTop: '2px solid #000', margin: '6px 0 ' }}></div>

          <table style={{ width: '100%', fontSize: `${Math.round(((orgSettings.printerFontSize || 13) - 2.5) * 1.75)}px`, fontWeight: 'normal', lineHeight: '1.4', color: '#333' }}>
            <tbody>
              {(returnItems.length > 0 || previewSale.invoiceDiscount > 0) && (
                <tr>
                  <td style={{ fontWeight: 'normal' }}>භාණ්ඩ වල එකතුව (Subtotal)</td>
                  <td style={{ textAlign: 'right', fontWeight: 'bold' }}>Rs. {subTotalAmount.toFixed(2)}</td>
                </tr>
              )}
              {returnItems.length > 0 && (
                <tr>
                  <td colSpan={2} style={{ padding: '8px 0 4px 0' }}>
                    <div style={{ border: '0.8px solid #666', padding: '4px', borderRadius: '2px' }}>
                      <div style={{ fontSize: '16px', fontWeight: '900', textAlign: 'center', borderBottom: '0.8px solid #666', marginBottom: '4px', paddingBottom: '2px' }}>
                        RETURNS / ආපසු ලැබීම්
                      </div>
                      <table style={{ width: '100%', fontSize: '18px' }}>
                        <tbody>
                          {returnItems.map((r: any, idx: number) => (
                            <tr key={`summary-ret-preview-${idx}`}>
                              <td style={{ fontWeight: 'normal', opacity: 0.9 }}>
                                {r.name} ({r.qty} x {Number(r.price).toFixed(0)})
                              </td>
                              <td style={{ textAlign: 'right', fontWeight: 'bold' }}>-Rs. {(Number(r.qty) * Number(r.price)).toFixed(2)}</td>
                            </tr>
                          ))}
                          <tr style={{ borderTop: '0.5px dashed #666' }}>
                            <td style={{ fontWeight: '900', fontSize: '16px', paddingTop: '2px' }}>මුළු ආපසු බීම එකතුව:</td>
                            <td style={{ textAlign: 'right', fontWeight: '900', fontSize: '16px', paddingTop: '2px' }}>-Rs. {returnAmount.toFixed(2)}</td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  </td>
                </tr>
              )}
              {previewSale.invoiceDiscount > 0 && (
                <tr>
                  <td style={{ fontWeight: 'normal', fontSize: '18px' }}>අඩු කළ වට්ටම (Discount) {previewSale.invoiceDiscount}%</td>
                  <td style={{ textAlign: 'right' }}>-Rs. {discountRs.toFixed(2)}</td>
                </tr>
              )}
            </tbody>
          </table>

          <div style={{ borderTop: '0.8px solid #000', margin: '4px 0 ', padding: '4px 0', display: 'flex', justifyContent: 'space-between', fontSize: `${Math.round(((orgSettings.printerFontSize || 13) - 1) * 1.75)}px`, fontWeight: 'bold', color: '#333' }}>
            <span>Net Total / මුළු එකතුව</span>
            <span>Rs. {Number(previewSale.total).toFixed(2)}</span>
          </div>

          <div style={{ borderTop: '1px solid #000', margin: '6px 0' }}></div>
          {showSimpleEnd ? (
            <div style={{ border: '2px solid #000', padding: '10px', marginTop: '10px', textAlign: 'center' }}>
              <div style={{ fontWeight: 'bold', fontSize: '25px' }}>අවසන් ශේෂය (Final Balance)</div>
              <div style={{ fontSize: '42px', fontWeight: 'bold' }}>Rs. {Number(previewSale.total || 0).toFixed(2)}</div>
            </div>
          ) : (
            <>
              <div style={{ textAlign: 'center', fontSize: '18px', fontWeight: 'bold' }}>DEBT STATEMENT / ණය විස්තරය</div>
              <table style={{ width: '100%', fontSize: '18px', marginTop: '4px' }}>
                <tbody>
                  <tr>
                    <td>කලින් තිබූ ණය (Previous Debt)</td>
                    <td style={{ textAlign: 'right' }}>Rs. {(Number(previewSale.previousBalance || 0) + Number(previewSale.initialCredit || 0)).toFixed(2)}</td>
                  </tr>
                  <tr>
                    <td>අද ණය (Today's Debt)</td>
                    <td style={{ textAlign: 'right' }}>Rs. {Number(previewSale.total || 0).toFixed(2)}</td>
                  </tr>
                  <tr>
                    <td><strong>මුළු ණය (Total Debt)</strong></td>
                    <td style={{ textAlign: 'right' }}><strong>Rs. {(Number(previewSale.previousBalance || 0) + Number(previewSale.initialCredit || 0) + Number(previewSale.total || 0)).toFixed(2)}</strong></td>
                  </tr>
                  <tr>
                    <td>අද ගෙවූ මුදල (Paid Today)</td>
                    <td style={{ textAlign: 'right' }}>Rs. {Math.max(0, (Number(previewSale.previousBalance || 0) + Number(previewSale.initialCredit || 0) + Number(previewSale.total || 0)) - Number(previewSale.newBalance || 0)).toFixed(2)}</td>
                  </tr>
                  {(previewSale.paymentType === 'Cash + Cheque' || (previewSale.cashAmount > 0 && previewSale.chequeAmount > 0)) && (
                    <>
                      <tr style={{ fontSize: '15px' }}>
                        <td style={{ paddingLeft: '12px' }}>* මුදලින් (Cash):</td>
                        <td style={{ textAlign: 'right' }}>Rs. {Number(previewSale.cashAmount || 0).toFixed(2)}</td>
                      </tr>
                      <tr style={{ fontSize: '15px' }}>
                        <td style={{ paddingLeft: '12px' }}>* චෙක්පතින් (Cheque): {previewSale.chequeNo ? `(${previewSale.chequeNo})` : ''}</td>
                        <td style={{ textAlign: 'right' }}>Rs. {Number(previewSale.chequeAmount || 0).toFixed(2)}</td>
                      </tr>
                    </>
                  )}
                </tbody>
              </table>
              <div style={{ border: '2px solid #000', padding: '10px', marginTop: '10px', textAlign: 'center' }}>
                <div style={{ fontWeight: 'bold', fontSize: '25px' }}>අවසන් ණය ශේෂය (Final Debt Balance)</div>
                <div style={{ fontSize: '42px', fontWeight: 'bold' }}>Rs. {Number(previewSale.newBalance || 0).toFixed(2)}</div>
              </div>
            </>
          )}
        </>
      )}
      <p style={{ textAlign: 'center', fontSize: '18px', marginTop: '16px', paddingBottom: '5px', fontWeight: 'bold' }}>
        බොහෝම ස්තුතියි! / THANK YOU!
      </p>
    </div>
  );
}
