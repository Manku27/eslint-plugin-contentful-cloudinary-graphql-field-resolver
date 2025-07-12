// eslint-plugin-contentful-migrations/index.js
const rule = require("./src/enforce-graphql-field-resolver");
module.exports = {
  meta: {
    name: "eslint-plugin-contentful-cloudinary-graphql-field-resolver",
    version: "1.0.0",
  },
  rules: {
    "enforce-contentful-cloudinary-graphql-field-resolver": rule,
  },
  configs: {
    recommended: {
      rules: {
        "contentful-migrations/enforce-contentful-cloudinary-graphql-field-resolver":
          "error",
      },
    },
  },
};
