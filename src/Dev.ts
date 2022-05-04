/*
const printRGBA = (source:ArrayBuffer) => {
	const dv = new DataView(source);
	for(let i = 0; i < source.byteLength; i += 4)
		console.log("0x" + dv.getUint32(i).toString(16).padStart(8, "0"));
}
*/

export const fetchToCanvas = async (url:string, canvas:HTMLCanvasElement):Promise<void> => {
	return new Promise(resolve => {
		const image = new Image();
		image.onload = () => {
			canvas.width = image.naturalWidth;
			canvas.height = image.naturalHeight;
			const ctx = canvas.getContext("2d")!;
			ctx.drawImage(image, 0, 0);
			resolve();
		}
		image.src = url;
	})
}

export const compare = (a:ArrayBuffer, b:ArrayBuffer):boolean => {
	if(a.byteLength !== b.byteLength)
		return false;
	const aa = new Uint8Array(a);
	const ba = new Uint8Array(b);
	for(let i = 0; i < a.byteLength; i++)
		if(aa[i] !== ba[i])
			return false;
	return true;
}

export const sha256Bytes = async (source:ArrayBuffer):Promise<string> => {
	const digest = await crypto.subtle.digest("SHA-256", source);
	const resultBytes = [...new Uint8Array(digest)];
	return resultBytes.map(x => x.toString(16).padStart(2, '0')).join("");
}

export const log = (message:string, element:HTMLElement) => {
	console.log(message);
	const row = document.createElement("p");
	row.innerHTML = message;
	element.append(row);
}