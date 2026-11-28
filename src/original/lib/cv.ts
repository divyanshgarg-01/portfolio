// Static GitHub Pages equivalent of the master CV URL. The visible View CV
// behaviour is unchanged; only the base-aware public path differs.
const BASE = (import.meta.env.BASE_URL || '/').replace(/\/$/, '');

export const CV_URL = `${BASE}/uploads/resume/Divyansh_Garg_CV.pdf`;
