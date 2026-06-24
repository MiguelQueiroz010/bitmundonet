/**
 * Equivalente JS de 7zip/SevenZipHelper.cs e 7zip/ICoder.cs
 * 
 * Nota: O JavaScript nativo (Browser/Node) não possui suporte embutido nativo para Compressão LZMA.
 * A Web Stream API (CompressionStream/DecompressionStream) suporta 'deflate' e 'gzip'.
 * Para utilizar LZMA, é necessário atrelar uma biblioteca como lzma-js (https://github.com/LZMA-JS/LZMA-JS)
 * ou um build WebAssembly de 7zip/LZMA.
 * 
 * Esta classe fornece a estrutura da Interface original.
 */

export class ICoder {
    /**
     * @param {Uint8Array} inStream - Input Stream buffer
     * @param {number} inSize - Input size
     * @param {number} outSize - Output size
     * @param {object} progress - Callback progress { setProgress(inSize, outSize) }
     * @returns {Promise<Uint8Array>}
     */
    async code(inStream, inSize, outSize, progress) {
        throw new Error("Not Implemented: Implement specific Coder");
    }
}

export const CoderPropID = {
    DefaultProp: 0,
    DictionarySize: 1,
    UsedMemorySize: 2,
    Order: 3,
    BlockSize: 4,
    PosStateBits: 5,
    LitContextBits: 6,
    LitPosBits: 7,
    NumFastBytes: 8,
    MatchFinder: 9,
    MatchFinderCycles: 10,
    NumPasses: 11,
    Algorithm: 12,
    NumThreads: 13,
    EndMarker: 14
};

export class SevenZipHelper {
    static DICTIONARY = 1 << 21; // 2 MB
    static POS_STATE_BITS = 2;
    static LIT_CONTEXT_BITS = 3;
    static LIT_POS_BITS = 0;
    static ALGORITHM = 2;
    static NUM_FAST_BYTES = 32;
    static EOS = false;

    static getPropIDs() {
        return [
            CoderPropID.DictionarySize,
            CoderPropID.PosStateBits,
            CoderPropID.LitContextBits,
            CoderPropID.LitPosBits,
            CoderPropID.Algorithm,
            CoderPropID.NumFastBytes,
            CoderPropID.MatchFinder,
            CoderPropID.EndMarker
        ];
    }

    static getProperties() {
        return [
            this.DICTIONARY,
            this.POS_STATE_BITS,
            this.LIT_CONTEXT_BITS,
            this.LIT_POS_BITS,
            this.ALGORITHM,
            this.NUM_FAST_BYTES,
            "bt4",
            this.EOS
        ];
    }

    /**
     * Compress using LZMA.
     * @param {Uint8Array} inStreamData 
     * @returns {Promise<Uint8Array>} compressedData
     */
    static async compress(inStreamData) {
        // Pseudo-código para o wrapper LZMA
        //let encoder = new LZMAEncoder();
        //encoder.setCoderProperties(this.getPropIDs(), this.getProperties());
        //let compressedBuffer = await encoder.code(inStreamData, ...);
        
        throw new Error("LZMA Compression Requires External Library (e.g. lzma-js or WASM).");
    }

    /**
     * Decompress LZMA compressed stream.
     * @param {Uint8Array} inStreamData 
     * @returns {Promise<Uint8Array>} decompressedData
     */
    static async decompress(inStreamData) {
        if (inStreamData.length < 5) {
            throw new Error("Input stream is too short.");
        }

        let properties = inStreamData.slice(0, 5);
        let dv = new DataView(inStreamData.buffer, inStreamData.byteOffset);
        
        // No C# o BinaryReader ler Int64 (8 bytes). 
        // Lembre-se que o DataView JS getBigInt64 funciona melhor para 64 bits.
        let decompressedSize = dv.getBigInt64(5, true); // Little Endian
        let compressedSize = dv.getBigInt64(13, true); // Little Endian

        let actualCompressedData = inStreamData.slice(21);

        // Pseudo-código para o wrapper LZMA
        // let decoder = new LZMADecoder();
        // decoder.setDecoderProperties(properties);
        // let result = await decoder.code(actualCompressedData, compressedSize, decompressedSize);
        // return result;

        throw new Error("LZMA Decompression Requires External Library (e.g. lzma-js or WASM).");
    }
}
