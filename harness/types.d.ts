// Khai báo giống react-app-env.d.ts của ứng dụng (create-react-app) để import ảnh / CSS
declare module "*.png" {
  const src: string;
  export default src;
}
declare module "*.css";
