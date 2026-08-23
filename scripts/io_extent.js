/**
 * Equivalente JS de IOextent.cs
 * Conversão de métodos de extensão C# para métodos estáticos focados em DataView/Uint8Array.
 * Útil para manipulação de leitura/escrita de arquivos brutos (ISO/UDF).
 */

export class IOextent {
    /**
     * Formata bytes em KB, MB, GB, etc.
     */
    static formatBytes(bytes, useUnit = false) {
        const suffix = [" B", " kB", " MB", " GB", " TB"];
        let count = 0;
        let dbl = bytes;
        while (bytes >= 1024 && count < suffix.length - 1) {
            bytes /= 1024;
            dbl = bytes;
            count++;
        }
        return `${dbl.toFixed(2)}${useUnit ? suffix[count] : ""}`;
    }

    /**
     * Equivalente a ReadBit(byte array, int offset)
     */
    static readBitFromByte(byteVal, offset) {
        return (byteVal & (1 << offset)) !== 0;
    }

    /**
     * Retorna array de bits representando o byte
     */
    static readBitsFromByte(byteVal) {
        let bits = [];
        for (let i = 0; i < 8; i++) {
            bits.push(IOextent.readBitFromByte(byteVal, i));
        }
        return bits;
    }

    /**
     * Lê uma fatia de um Uint8Array
     */
    static readBytes(buffer, offset, size) {
        // Assume 'buffer' é um ArrayBuffer ou TypedArray
        const buf = buffer.buffer || buffer;
        const start = buffer.byteOffset ? buffer.byteOffset + offset : offset;
        return new Uint8Array(buf, start, size);
    }

    /**
     * Lê DataView como um inteiro sem sinal (8, 16, 32)
     * @param {DataView} view 
     * @param {number} offset 
     * @param {number} bits (8, 16, 32)
     * @param {boolean} bigendian 
     */
    static readUInt(viewOrBuffer, offset, bits, bigendian = false) {
        let view;
        if (viewOrBuffer instanceof DataView) {
            view = viewOrBuffer;
        } else {
            // Se for ArrayBuffer ou TypedArray, embrulhar em DataView
            const buf = viewOrBuffer.buffer || viewOrBuffer;
            const byteOffset = viewOrBuffer.byteOffset || 0;
            view = new DataView(buf, byteOffset);
        }

        const littleEndian = !bigendian;
        switch (bits) {
            case 8:
                return view.getUint8(offset);
            case 16:
                return view.getUint16(offset, littleEndian);
            case 32:
                return view.getUint32(offset, littleEndian);
            default:
                throw new Error("Bits must be 8, 16 or 32");
        }
    }

    /**
     * Lê um long de 64 bits sem sinal
     */
    static readULong(viewOrBuffer, offset, bigendian = false) {
        let view;
        if (viewOrBuffer instanceof DataView) {
            view = viewOrBuffer;
        } else {
            const buf = viewOrBuffer.buffer || viewOrBuffer;
            const byteOffset = viewOrBuffer.byteOffset || 0;
            view = new DataView(buf, byteOffset);
        }
        return view.getBigUint64(offset, !bigendian);
    }

    /**
     * Lê uma string terminada em Null (ou byte limitador específico)
     * @param {Uint8Array} buffer 
     * @param {number} offset 
     * @param {number} breakeroff 
     */
    static readBroke(buffer, offset, breakeroff = 0) {
        // Garantir Uint8Array para acesso por indice [i]
        const uint8 = (buffer instanceof Uint8Array) ? buffer : new Uint8Array(buffer.buffer || buffer, buffer.byteOffset || 0);
        let result = [];
        let i = offset;
        while (i < uint8.length && uint8[i] !== breakeroff) {
            result.push(uint8[i]);
            i++;
        }
        return new Uint8Array(result);
    }

    /**
     * Lê string terminada em um byte limitador
     */
    static readString(buffer, offset, breakeroff = 0) {
        let bytes = IOextent.readBroke(buffer, offset, breakeroff);
        let decoder = new TextDecoder("utf-8"); // Default encoding
        return decoder.decode(bytes);
    }

    /**
     * Lê um LBA de setor de tamanho específico (default 2048) a partir de um File/Blob/Buffer (deve ser convertido para ArrayBuffer previamente).
     * @param {ArrayBuffer} buffer
     * @param {number} lba
     * @param {number} size
     */
    static readSector(buffer, lba, size = 2048) {
        const offset = lba * size;
        return new Uint8Array(buffer, offset, size);
    }

    /**
     * Devolve array preenchida com um valor específico
     */
    static getFilledArray(size, fillwith = 0) {
        let arr = new Uint8Array(size);
        arr.fill(fillwith);
        return arr;
    }

    /**
     * Gera DateTime do JS baseado na formatação do array de tempo (C#)
     */
    static getDateTimeDir(bufferOffsetArray) {
        try {
            let year = bufferOffsetArray[0] + 1900;
            let month = bufferOffsetArray[1] - 1; // JS months are 0-11
            let day = bufferOffsetArray[2];
            let hour = bufferOffsetArray[3];
            let min = bufferOffsetArray[4];
            let sec = bufferOffsetArray[5];
            return new Date(year, month, day, hour, min, sec);
        } catch (e) {
            return new Date(0);
        }
    }

    /**
     * Converte o Date de volta pra bytes
     */
    static getDateTimeData(dateObj) {
        const arr = new Uint8Array(7);
        arr[0] = dateObj.getFullYear() - 1900;
        arr[1] = dateObj.getMonth() + 1;
        arr[2] = dateObj.getDate();
        arr[3] = dateObj.getHours();
        arr[4] = dateObj.getMinutes();
        arr[5] = dateObj.getSeconds();
        arr[6] = 0; // GMT Position
        return arr;
    }

    /**
     * Converte 16/32 bits para par LE+BE (ex: [01 00 00 01] para 1)
     */
    static toLEBE(value, bits) {
        const bytes = bits / 8;
        const out = new Uint8Array(bytes * 2);
        const dv = new DataView(out.buffer);
        if (bits === 16) {
            dv.setUint16(0, value, true);
            dv.setUint16(2, value, false);
        } else if (bits === 32) {
            dv.setUint32(0, value, true);
            dv.setUint32(4, value, false);
        }
        return out;
    }

    /**
     * Escreve valor no buffer (TypedArray ou DataView)
     */
    static writeUInt(viewOrBuffer, offset, bits, value, bigendian = false) {
        let view = (viewOrBuffer instanceof DataView) ? viewOrBuffer : new DataView(viewOrBuffer.buffer || viewOrBuffer, viewOrBuffer.byteOffset || 0);
        const littleEndian = !bigendian;
        if (bits === 8) view.setUint8(offset, value);
        else if (bits === 16) view.setUint16(offset, value, littleEndian);
        else if (bits === 32) view.setUint32(offset, value, littleEndian);
    }

    static createMD5() {
        // Standard MD5 (RFC 1321) implementation
        function md5cycle(x, k) {
            var a = x[0], b = x[1], c = x[2], d = x[3];
            a = ff(a, b, c, d, k[0], 7, -680876936); d = ff(d, a, b, c, k[1], 12, -389564586);
            c = ff(c, d, a, b, k[2], 17, 606105819); b = ff(b, c, d, a, k[3], 22, -1044525330);
            a = ff(a, b, c, d, k[4], 7, -176418897); d = ff(d, a, b, c, k[5], 12, 1200080426);
            c = ff(c, d, a, b, k[6], 17, -1473231341); b = ff(b, c, d, a, k[7], 22, -45705983);
            a = ff(a, b, c, d, k[8], 7, 1770035416); d = ff(d, a, b, c, k[9], 12, -1958414417);
            c = ff(c, d, a, b, k[10], 17, -42063); b = ff(b, c, d, a, k[11], 22, -1990404162);
            a = ff(a, b, c, d, k[12], 7, 1804603682); d = ff(d, a, b, c, k[13], 12, -40341101);
            c = ff(c, d, a, b, k[14], 17, -1502002290); b = ff(b, c, d, a, k[15], 22, 1236535329);
            a = gg(a, b, c, d, k[1], 5, -165796510); d = gg(d, a, b, c, k[6], 9, -1069501632);
            c = gg(c, d, a, b, k[11], 14, 643717713); b = gg(b, c, d, a, k[0], 20, -373897302);
            a = gg(a, b, c, d, k[5], 5, -701558691); d = gg(d, a, b, c, k[10], 9, 38016083);
            c = gg(c, d, a, b, k[15], 14, -660478335); b = gg(b, c, d, a, k[4], 20, -405537848);
            a = gg(a, b, c, d, k[9], 5, 568446438); d = gg(d, a, b, c, k[14], 9, -1019803690);
            c = gg(c, d, a, b, k[3], 14, -187363961); b = gg(b, c, d, a, k[8], 20, 1163531501);
            a = gg(a, b, c, d, k[13], 5, -1444681467); d = gg(d, a, b, c, k[2], 9, -51403784);
            c = gg(c, d, a, b, k[7], 14, 1735328473); b = gg(b, c, d, a, k[12], 20, -1926607734);
            a = hh(a, b, c, d, k[5], 4, -378558); d = hh(d, a, b, c, k[8], 11, -2022574463);
            c = hh(c, d, a, b, k[11], 16, 1839030562); b = hh(b, c, d, a, k[14], 23, -35309556);
            a = hh(a, b, c, d, k[1], 4, -1530992060); d = hh(d, a, b, c, k[4], 11, 1272893353);
            c = hh(c, d, a, b, k[7], 16, -155497632); b = hh(b, c, d, a, k[10], 23, -1094730640);
            a = hh(a, b, c, d, k[13], 4, 681279174); d = hh(d, a, b, c, k[0], 11, -358537222);
            c = hh(c, d, a, b, k[3], 16, -722521979); b = hh(b, c, d, a, k[6], 23, 76029189);
            a = hh(a, b, c, d, k[9], 4, -640364487); d = hh(d, a, b, c, k[12], 11, -421815835);
            c = hh(c, d, a, b, k[15], 16, 530742520); b = hh(b, c, d, a, k[2], 23, -995338651);
            a = ii(a, b, c, d, k[0], 6, -198630844); d = ii(d, a, b, c, k[7], 10, 1126891415);
            c = ii(c, d, a, b, k[14], 15, -1416354905); b = ii(b, c, d, a, k[5], 21, -57434055);
            a = ii(a, b, c, d, k[12], 6, 1700485571); d = ii(d, a, b, c, k[3], 10, -1894986606);
            c = ii(c, d, a, b, k[10], 15, -1051523); b = ii(b, c, d, a, k[1], 21, -2054922799);
            a = ii(a, b, c, d, k[8], 6, 1873313359); d = ii(d, a, b, c, k[15], 10, -30611744);
            c = ii(c, d, a, b, k[6], 15, -1560198380); b = ii(b, c, d, a, k[13], 21, 1309151649);
            a = ii(a, b, c, d, k[4], 6, -145523070); d = ii(d, a, b, c, k[11], 10, -1120210379);
            c = ii(c, d, a, b, k[2], 15, 718787280); b = ii(b, c, d, a, k[9], 21, -343485551);
            x[0] = add32(a, x[0]); x[1] = add32(b, x[1]); x[2] = add32(c, x[2]); x[3] = add32(d, x[3]);
        }
        function cmn(q, a, b, x, s, t) { a = add32(add32(a, q), add32(x, t)); return add32((a << s) | (a >>> (32 - s)), b); }
        function ff(a, b, c, d, x, s, t) { return cmn((b & c) | ((~b) & d), a, b, x, s, t); }
        function gg(a, b, c, d, x, s, t) { return cmn((b & d) | (c & (~d)), a, b, x, s, t); }
        function hh(a, b, c, d, x, s, t) { return cmn(b ^ c ^ d, a, b, x, s, t); }
        function ii(a, b, c, d, x, s, t) { return cmn(c ^ (b | (~d)), a, b, x, s, t); }
        function add32(a, b) { return (a + b) & 0xFFFFFFFF; }
        
        var state = [1732584193, -271733879, -1732584194, 271733878];
        var buffer = new Uint8Array(64);
        var bufferPtr = 0, totalLen = 0;
        
        return {
            update: function (chunk) {
                totalLen += chunk.length;
                let offset = 0;
                while (offset < chunk.length) {
                    let len = Math.min(64 - bufferPtr, chunk.length - offset);
                    buffer.set(chunk.subarray(offset, offset + len), bufferPtr);
                    bufferPtr += len;
                    offset += len;
                    if (bufferPtr === 64) {
                        md5cycle(state, new Int32Array(buffer.buffer));
                        bufferPtr = 0;
                    }
                }
            },
            digest: function () {
                var tail = new Uint8Array(64);
                tail.set(buffer.subarray(0, bufferPtr));
                tail[bufferPtr] = 0x80;
                if (bufferPtr >= 56) {
                    md5cycle(state, new Int32Array(tail.buffer));
                    tail.fill(0);
                }
                var dv = new DataView(tail.buffer);
                dv.setUint32(56, totalLen * 8, true);
                md5cycle(state, new Int32Array(tail.buffer));
                return state.map(x => (x >>> 0).toString(16).padStart(8, '0')).reverse().join('');
            }
        };
    }
}
