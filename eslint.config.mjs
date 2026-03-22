import nextConfig from "eslint-config-next";

const eslintConfig = [
  ...nextConfig,
  {
    rules: {
      // Pre-existing: project uses <img> widely; migrate to <Image> separately
      "@next/next/no-img-element": "off",
      // Pre-existing: many components access refs during render for derived state
      "react-hooks/refs": "warn",
      // Pre-existing: setState-in-effect patterns used for data fetching
      "react-hooks/set-state-in-effect": "warn",
      // Pre-existing: exhaustive-deps in complex subscription hooks
      "react-hooks/exhaustive-deps": "warn",
    },
  },
  {
    ignores: [".next/", "node_modules/", "data/", "public/output/"],
  },
];

export default eslintConfig;
