declare module 'pako' {
  export function gzip(data: Uint8Array): Uint8Array;
}