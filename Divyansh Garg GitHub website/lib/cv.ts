// The CV is a real PDF already present in the project (byte-identical copy at
// public/uploads/resume/Divyansh_Garg_CV.pdf). The default path is same-origin,
// so View CV opens it in a new tab with the browser's native PDF viewer.
// Override with NEXT_PUBLIC_CV_URL if the file is ever moved.
export const CV_URL = process.env.NEXT_PUBLIC_CV_URL?.trim() || '/uploads/resume/Divyansh_Garg_CV.pdf';
