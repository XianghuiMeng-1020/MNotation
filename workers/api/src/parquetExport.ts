import { Table as ArrowTable, tableFromJSON, tableToIPC } from "apache-arrow";
import { writeParquet, Table as WasmTable, WriterPropertiesBuilder, Compression } from "parquet-wasm/bundler";

/** Normalize DB row values for Arrow JSON table (no nested objects / bigint issues). */
export function normalizeExportRow(row: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) {
    if (v === null || v === undefined) {
      out[k] = null;
    } else if (typeof v === "bigint") {
      out[k] = v.toString();
    } else if (typeof v === "object") {
      out[k] = JSON.stringify(v);
    } else {
      out[k] = v;
    }
  }
  return out;
}

export function buildLabelsParquetBytes(
  rows: Record<string, unknown>[],
  compression: "snappy" | "zstd" = "snappy"
): Uint8Array {
  const arrowTable = rows.length === 0 ? new ArrowTable() : tableFromJSON(rows as any);
  const ipc = tableToIPC(arrowTable, "stream");
  const wasmTable = WasmTable.fromIPCStream(ipc);
  const codec = compression === "zstd" ? Compression.ZSTD : Compression.SNAPPY;
  const props = new WriterPropertiesBuilder().setCompression(codec).build();
  return writeParquet(wasmTable, props);
}

export function buildLabelsArrowIpcBytes(rows: Record<string, unknown>[]): Uint8Array {
  const arrowTable = rows.length === 0 ? new ArrowTable() : tableFromJSON(rows as any);
  return tableToIPC(arrowTable, "stream");
}
