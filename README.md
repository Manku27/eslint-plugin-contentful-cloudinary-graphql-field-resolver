# eslint-plugin-contentful-migrations

An ESLint plugin to enforce correct `Contentful:GraphQLFieldResolver` annotations on 'JSON' type fields in Contentful migration scripts with **Cloudinary integration**, ensuring proper "Resolve content on delivery" functionality.

## Table of Contents

- [Why This Plugin?](#why-this-plugin)
- [Installation](#installation)
- [Usage](#usage)
  - [ESLint v8.x and older (.eslintrc.js)](#eslint-v8x-and-older-eslintrcjs)
  - [ESLint v9.x and newer (eslint.config.js - Flat Config)](#eslint-v9x-and-newer-eslintconfigjs---flat-config)
- [Rule](#rule)
  - [`contentful-migrations/enforce-graphql-field-resolver`](#contentful-migrationsenforce-graphql-field-resolver)
- [Autofixing](#autofixing)
- [Finding `appFunctionId` and `appDefinitionId`](#finding-appfunctionid-and-appdefinitionid)
- [Security Considerations](#security-considerations)
- [Known Issues & Context](#known-issues--context)

---

## Why This Plugin?

When working with Contentful content models, especially when utilizing GraphQL field resolvers for "Resolve content on delivery" features on a JSON type Cloudinary Image field, inconsistencies can arise in generated migration scripts.

**The Problem:**

Contentful migration generation sometimes fails to properly include the `Contentful:GraphQLFieldResolver` annotation with its required `appFunctionId` and `appDefinitionId` parameters. This leads to the "Resolve content on delivery" option being unchecked or ineffective in your target Contentful environment, preventing fields from being resolved via the Contentful GraphQL API.

**Observed Scenarios:**

1.  **When creating a new field and setting its UI control (and potentially "Resolve content on delivery" simultaneously):**
    The migration script might only generate `createField` and `changeFieldControl` lines, completely **omitting the `setAnnotations` call** for GraphQL resolvers.

    **Example (Problematic):**

    ```javascript
    function migrationFunction(migration, context) {
      const testSample = migration.createContentType("testSample");
      testSample.name("testSampleImg").description("");

      const testSampleImg = testSampleImg.createField("image");
      testSampleImgTestSampleImgField
        .name("image")
        .type("Object") // This is an Object field!
        .localized(false)
        .required(false)
        .validations([])
        .disabled(false)
        .omitted(false);
      // Missing setAnnotations!
    }
    ```

2.  **When modifying an existing field or creating a new field and then later applying "Resolve content on delivery" (which might trigger a re-evaluation by the Contentful migration tool):**
    The migration script might generate the `setAnnotations(["Contentful:GraphQLFieldResolver"])` line, but **fails to include the necessary `parameters` object** containing `appFunctionId` and `appDefinitionId`.

    **Example (Problematic):**

    ```javascript
    function migrationFunction(migration, context) {
      const testSampleImg = testSample.editField("image");
      testSampleImg.setAnnotations(["Contentful:GraphQLFieldResolver"]); // Missing parameters object!
    }
    ```

**The Solution:**

This plugin identifies these missing or incomplete annotations for 'Object' type fields and provides an autofix to ensure they always include the correct `Contentful:GraphQLFieldResolver` annotation with the necessary `appFunctionId` and `appDefinitionId`.

**Corrected Snippet Example:**

```javascript
const testSampleImg = testSample.editField("image");

testSampleImg.setAnnotations(["Contentful:GraphQLFieldResolver"], {
  parameters: {
    appFunctionId: "YOUR_APP_FUNCTION_ID",
    appDefinitionId: "YOUR_APP_DEFINITION_ID",
  },
});
```

---

## Installation

First, install the plugin from npm:

```bash
npm install --save-dev eslint-plugin-contentful-migrations
# OR
yarn add --dev eslint-plugin-contentful-migrations
```

You will also need `eslint` itself:

```bash
npm install --save-dev eslint
# OR
yarn add --dev eslint
```

---

## Usage

Depending on your ESLint version, you will configure the plugin slightly differently.

In your `eslint.config.js` (or similar `eslintrc`), import the plugin and configure it within a config object.

**You MUST provide `appFunctionId` and `appDefinitionId` directly in the rule's options array.**

```javascript
// eslint.config.js
import { defineConfig } from "eslint/config";
import contentfulCloudinaryGraphqlFieldResolverPlugin from "eslint-plugin-contentful-cloudinary-graphql-field-resolver";

export default defineConfig([
  // --- General configuration (if any) ---
  {
    files: ["**/*.js", "**/*.jsx", "**/*.ts", "**/*.tsx"],
    // ... your general plugins and rules
  },

  // --- Specific configuration for migration files with parameters ---
  {
    files: ["**/migrations/*.js"], // Target only JS files within 'migrations' directories
    plugins: {
      // Give your plugin an alias (e.g., 'contentfulCloudinary')
      contentfulCloudinary: contentfulCloudinaryGraphqlFieldResolverPlugin,
    },
    rules: {
      // Enable your custom rule for these specific files and pass parameters
      "contentfulCloudinary/enforce-contentful-cloudinary-graphql-field-resolver":
        [
          "error", // Rule severity (e.g., "error", "warn", "off")
          {
            appFunctionId: "YOUR_APP_FUNCTION_ID", // Replace with your actual App Function ID
            appDefinitionId: "YOUR_APP_DEFINITION_ID", // Replace with your actual App Definition ID
          },
        ],
      // You can also override other rules for these files here if needed
      "no-console": "off", // Example: allow console logs in migrations
    },
  },

  // Add more configurations as needed
]);
```

---

## Rule

### `contentful-migrations/enforce-graphql-field-resolver`

This rule ensures that:

1.  Any `Object` type field (created with `createField` set to type `'Object'`) has a `setAnnotations` call.
2.  If the `Contentful:GraphQLFieldResolver` annotation is present, its second argument (the options object) must contain a `parameters` object, which in turn must contain `appFunctionId` and `appDefinitionId`.
3.  If `appFunctionId` or `appDefinitionId` are missing from the ESLint rule configuration, the rule will report an error but _will not_ provide a fix.

**Configuration Options:**

The rule accepts an object with the following properties:

- `appFunctionId` (string, **required for autofix**): The ID of your Contentful App Function to be used as the GraphQL Field Resolver.
- `appDefinitionId` (string, **required for autofix**): The ID of your Contentful App Definition.

**Example Configuration (part of your `.eslintrc.js` or `eslint.config.js`):**

```javascript
// For eslint.config.js (rule options)
'contentful-migrations/enforce-graphql-field-resolver': ['error', {
  appFunctionId: 'YOUR_APP_FUNCTION_ID',
  appDefinitionId: 'YOUR_APP_DEFINITION_ID',
}]
```

---

## Autofixing

This rule is `fixable`. When you run ESLint with the `--fix` flag, it will automatically:

- Add the complete `setAnnotations(["Contentful:GraphQLFieldResolver"], { parameters: { appFunctionId: '...', appDefinitionId: '...' } })` call if an 'Object' type field is missing it.
- Correct or add the `parameters` object with `appFunctionId` and `appDefinitionId` if the `Contentful:GraphQLFieldResolver` annotation is present but incomplete.

**Example CLI usage:**

```bash
npx eslint "your-migration-file.js" --fix
# Or to fix all migration files in a directory
npx eslint "migrations/**/*.js" --fix
```

---

## Finding `appFunctionId` and `appDefinitionId`

If you don't have these IDs handy, you can find them using the Contentful CLI:

1.  **Ensure you have the Contentful CLI installed:**
    ```bash
    npm install -g contentful-cli
    ```
2.  **Log in to the CLI:**
    ```bash
    contentful login
    ```
3.  **Export your content model:**
    ```bash
    contentful space export --space-id {YOUR_SPACE_ID} --skip-content --skip-assets --content-model-only --output-file content-model-export.json
    ```
4.  Open `content-model-export.json`. You can typically find the `appDefinitionId` and the `appFunctionId`.
