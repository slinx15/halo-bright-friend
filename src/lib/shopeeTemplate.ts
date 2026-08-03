import { unzipSync, zipSync, strFromU8, strToU8 } from "fflate";

export interface ShopeeExportRow {
  shopee_product_id: string;
  shopee_product_name: string;
  variation_id: string;
  variation_name: string;
  parent_sku: string | null;
  sku: string | null;
  price: string | null;
  min_qty: string | null;
  max_qty: string | null;
  stok: number;
}

// Style index per kolom, mengikuti template asli Shopee (A..O)
const COL_STYLES = [1, 2, 2, 2, 3, 3, 4, 3, 5, 3, 3, 3, 3, 3, 6];
const COL_LETTERS = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L", "M", "N", "O"];

function esc(v: string) {
  return v
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function buildRowXml(rowIdx: number, values: (string | null)[]) {
  const cells = values
    .map((val, i) => {
      const ref = `${COL_LETTERS[i]}${rowIdx}`;
      const s = COL_STYLES[i];
      if (val === null || val === "") return `<c r="${ref}" s="${s}"/>`;
      return `<c r="${ref}" s="${s}" t="inlineStr"><is><t xml:space="preserve">${esc(val)}</t></is></c>`;
    })
    .join("");
  return `<row customHeight="true" ht="15" r="${rowIdx}">${cells}</row>`;
}

export async function downloadShopeeStockFile(rows: ShopeeExportRow[]) {
  const res = await fetch("/shopee-template.xlsx");
  if (!res.ok) throw new Error("Template Shopee tidak ditemukan");
  const buf = new Uint8Array(await res.arrayBuffer());
  const files = unzipSync(buf);

  const sheetPath = "xl/worksheets/sheet1.xml";
  let xml = strFromU8(files[sheetPath]);

  const startTag = "<sheetData>";
  const endTag = "</sheetData>";
  const start = xml.indexOf(startTag);
  const end = xml.indexOf(endTag);
  const headerRows = xml.slice(start + startTag.length, end);

  const body = rows
    .map((r, idx) =>
      buildRowXml(idx + 7, [
        r.shopee_product_id,
        r.shopee_product_name,
        r.variation_id,
        r.variation_name,
        r.parent_sku,
        r.sku,
        r.price,
        null,
        String(r.stok),
        r.min_qty,
        r.max_qty,
        null,
        null,
        null,
        null,
      ])
    )
    .join("");

  xml =
    xml.slice(0, start) +
    startTag +
    headerRows +
    body +
    xml.slice(end);

  files[sheetPath] = strToU8(xml);

  const outBuf = zipSync(files, { level: 6 });
  const blob = new Blob([outBuf as unknown as BlobPart], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  const today = new Date().toISOString().slice(0, 10);
  a.download = `update_stok_shopee_${today}.xlsx`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
