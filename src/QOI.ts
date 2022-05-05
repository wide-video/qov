const QOI_MAGIC = 0x716f6966; // [...new TextEncoder().encode("qoif")].map(item => item.toString(16)).join("")
const QOI_HEADER_SIZE = 14;
const QOI_PADDING = new Uint8Array(8);
QOI_PADDING[7] = 1;

export const QOI_COLOR_HASH = (r:number, g:number, b:number, a:number):number => 
	(r * 3 + g * 5 + b * 7 + a * 11) % 64;

export const QOI_RGBA = (r:number, g:number, b:number, a:number):number => 
	(r << 24 | g << 16 | b << 8 | a) >>> 0;

// -128...127
export const QOI_SIGNED8 = (value:number) =>
	(value & 0b10000000 ? (value - 256) : (value + 256)) % 256;

export const QOI_UNSIGNED8 = (value:number) =>
	(value + 256) % 256;

export function encode(source:Image):ArrayBuffer {
	const {channels, colorspace, data, height, width} = source;
	const max_size = width * height * (channels + 1) + QOI_HEADER_SIZE + QOI_PADDING.byteLength;
	const index = new Uint32Array(64);
	const bytes = new Uint8Array(max_size);
	const pixels = new Uint8Array(data);

	const header = new DataView(bytes.buffer);
	header.setUint32(0, QOI_MAGIC);
	header.setUint32(4, width);
	header.setUint32(8, height);
	header.setUint8(12, channels);
	header.setUint8(13, colorspace);

	let p = QOI_HEADER_SIZE;
	let run = 0;
	let px_prev_r = 0;
	let px_prev_g = 0;
	let px_prev_b = 0;
	let px_prev_a = 255;
	let px_prev = px_prev_a;
	let px_a = px_prev_a;

	const px_len = width * height * channels;
	const px_end = px_len - channels;
	for(let px_pos = 0; px_pos < px_len; px_pos += channels) {
		const px_r = pixels[px_pos]!;
		const px_g = pixels[px_pos + 1]!;
		const px_b = pixels[px_pos + 2]!;
		if(channels === 4)
			px_a = pixels[px_pos + 3]!;
		
		const px = QOI_RGBA(px_r, px_g, px_b, px_a);

		if(px === px_prev) {
			run++;
			if(run === 62 || px_pos === px_end) {
				bytes[p++] = 0b11000000 | (run - 1);
				run = 0;
			}
		} else {
			if(run > 0) {
				bytes[p++] = 0b11000000 | (run - 1);
				run = 0;
			}
			
			const index_pos = QOI_COLOR_HASH(px_r, px_g, px_b, px_a);
			if(index[index_pos] === px) {
				bytes[p++] = index_pos; // QOI_OP_INDEX 0x00
			} else {
				index[index_pos] = px;

				if (px_a === px_prev_a) {
					const vr = QOI_SIGNED8(px_r - px_prev_r);
					const vg = QOI_SIGNED8(px_g - px_prev_g);
					const vb = QOI_SIGNED8(px_b - px_prev_b);
					const vg_r = vr - vg;
					const vg_b = vb - vg;

					if(vr > -3 && vr < 2 && vg > -3 && vg < 2 && vb > -3 && vb < 2) {
						bytes[p++] = 0b01000000 | (vr + 2) << 4 | (vg + 2) << 2 | (vb + 2); // QOI_OP_DIFF
					} else if(vg_r > -9 && vg_r <  8 && vg > -33 && vg < 32 && vg_b > -9 && vg_b < 8) {
						bytes[p++] = 0b10000000 | (vg + 32); // QOI_OP_LUMA
						bytes[p++] = (vg_r + 8) << 4 | (vg_b +  8);
					} else {
						bytes[p++] = 0b11111110; // QOI_OP_RGB
						bytes[p++] = px_r;
						bytes[p++] = px_g;
						bytes[p++] = px_b;
					}
				} else {
					bytes[p++] = 0b11111111; // QOI_OP_RGBA
					bytes[p++] = px_r;
					bytes[p++] = px_g;
					bytes[p++] = px_b;
					bytes[p++] = px_a;
				}
			}
		}
		px_prev_r = px_r;
		px_prev_g = px_g;
		px_prev_b = px_b;
		px_prev_a = px_a;
		px_prev = px;
	}

	bytes.set(QOI_PADDING, p)
	p += QOI_PADDING.length;

	return bytes.slice(0, p).buffer;
}

export function decode(source:ArrayBuffer):Image {
	const bytes = new Uint8Array(source);
	const header = new DataView(bytes.buffer);
	//const header_magic = header.getUint32(0);
	const width = header.getUint32(4);
	const height = header.getUint32(8);
	const channels = header.getUint8(12) === 3 ? 3 : 4;
	const colorspace = header.getUint8(13) === 0 ? 0 : 1;
	const px_len = width * height * channels;
	const pixels = new Uint8Array(px_len);
	const index = new Uint32Array(64);

	let px_r = 0;
	let px_g = 0;
	let px_b = 0;
	let px_a = 255;
	let run = 0;
	let p = QOI_HEADER_SIZE;

	for (let px_pos = 0; px_pos < px_len; px_pos += channels) {
		if (run > 0) {
			run--;
		} else {
			const b1 = bytes[p++]!;
			if (b1 === 0b11111110) { // QOI_OP_RGB
				px_r = bytes[p++]!;
				px_g = bytes[p++]!;
				px_b = bytes[p++]!;
				index[QOI_COLOR_HASH(px_r, px_g, px_b, px_a)] = QOI_RGBA(px_r, px_g, px_b, px_a);
			} else if (b1 === 0b11111111) { // QOI_OP_RGBA
				px_r = bytes[p++]!;
				px_g = bytes[p++]!;
				px_b = bytes[p++]!;
				px_a = bytes[p++]!;
				index[QOI_COLOR_HASH(px_r, px_g, px_b, px_a)] = QOI_RGBA(px_r, px_g, px_b, px_a);
			} else {
				const op = b1 & 0b11000000;
				if (op === 0b00000000) { // QOI_OP_INDEX
					const px = index[b1]!;
					px_r = px >> 24;
					px_g = px >> 16 & 0xff;
					px_b = px >> 8 & 0xff;
					px_a = px & 0xff;
					index[QOI_COLOR_HASH(px_r, px_g, px_b, px_a)] = px;
				} else if (op === 0b01000000) { // // QOI_OP_DIFF
					px_r = QOI_UNSIGNED8(px_r + ((b1 >> 4) & 0x03) - 2);
					px_g = QOI_UNSIGNED8(px_g + ((b1 >> 2) & 0x03) - 2);
					px_b = QOI_UNSIGNED8(px_b + (b1 & 0x03) - 2);
					index[QOI_COLOR_HASH(px_r, px_g, px_b, px_a)] = QOI_RGBA(px_r, px_g, px_b, px_a);
				} else if (op === 0b10000000) { // QOI_OP_LUMA
					const b2 = bytes[p++]!;
					const vg = (b1 & 0x3f) - 32;
					px_r = QOI_UNSIGNED8(px_r + vg - 8 + ((b2 >> 4) & 0x0f));
					px_g = QOI_UNSIGNED8(px_g + vg);
					px_b = QOI_UNSIGNED8(px_b + vg - 8 +  (b2 & 0x0f));
					index[QOI_COLOR_HASH(px_r, px_g, px_b, px_a)] = QOI_RGBA(px_r, px_g, px_b, px_a);
				} else if (op === 0b11000000) { // QOI_OP_RUN
					run = b1 & 0x3f;
				}
			}
		}

		pixels[px_pos] = px_r;
		pixels[px_pos + 1] = px_g;
		pixels[px_pos + 2] = px_b;
		if (channels === 4)
			pixels[px_pos + 3] = px_a;
	}

	return {width, height, channels, colorspace, data:pixels.buffer};
}

type Image = {
	readonly width:number;
	readonly height:number;
	readonly channels:3 | 4;
	readonly colorspace:0 | 1;
	readonly data:ArrayBuffer;
}