import type { LayoutServerLoad } from "./$types";

export const load: LayoutServerLoad = async () => {
  // The layout server no longer needs to handle data loading
  // The page server will handle redirects and data loading
  return {};
};
