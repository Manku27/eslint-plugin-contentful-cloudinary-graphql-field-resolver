module.exports = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Enforce that 'Object' type fields created/edited have the correct 'Contentful:GraphQLFieldResolver' annotation with parameters.",
      category: "Mandatory change",
      recommended: true,
    },
    fixable: "code",
    schema: [
      {
        type: "object",
        properties: {
          appFunctionId: {
            type: "string",
          },
          appDefinitionId: {
            type: "string",
          },
        },
        additionalProperties: false,
      },
    ],
    messages: {
      missingParameters:
        "The 'Contentful:GraphQLFieldResolver' annotation must have a second argument with a 'parameters' object containing 'appFunctionId' and 'appDefinitionId'.",
      missingAnnotation:
        "Object field '{{ fieldName }}' is missing the 'setAnnotations' call for the GraphQL resolver.",
      missingIdsInConfig:
        "Rule configuration is missing 'appFunctionId' or 'appDefinitionId'. Cannot fix.",
    },
  },

  create(context) {
    const ruleOptions = context.options[0] || {};
    const { appFunctionId, appDefinitionId } = ruleOptions;

    // A map to track variables for content type fields
    // Key: variable name, Value: { node: ASTNode, fieldName: string, hasResolverAnnotation: boolean, isObjectType: boolean }
    const fieldVariables = new Map();

    /**
     * Helper function to get the name of the root identifier in a chained call.
     * For `a.b().c()`, it returns 'a'.
     * For `a().b()`, it returns 'a'.
     * For `a`, it returns 'a'.
     * @param {ASTNode} node The AST node (e.g., CallExpression, MemberExpression, Identifier)
     * @returns {string|null} The name of the root identifier or null if not found.
     */
    function getRootIdentifierName(node) {
      // If it's an Identifier, we've found the root
      if (node.type === "Identifier") {
        return node.name;
      }
      // If it's a CallExpression, look at the callee
      if (node.type === "CallExpression") {
        return getRootIdentifierName(node.callee);
      }
      // If it's a MemberExpression, look at the object
      if (node.type === "MemberExpression") {
        return getRootIdentifierName(node.object);
      }
      // If it's something else, we can't find a root identifier
      return null;
    }

    return {
      // Scenario 1: Find existing `setAnnotations` calls that are incorrect or incomplete
      "CallExpression[callee.property.name='setAnnotations']"(node) {
        const firstArg = node.arguments[0];
        if (!firstArg || firstArg.type !== "ArrayExpression") return;

        const hasResolverAnnotation = firstArg.elements.some(
          (el) =>
            el.type === "Literal" &&
            el.value === "Contentful:GraphQLFieldResolver"
        );

        if (!hasResolverAnnotation) return;

        // Mark that this variable has the annotation
        // Use the helper to get the root identifier name
        // This state tells us that the field has the resolver annotation, so we can remove the lint error
        const rootIdentifierName = getRootIdentifierName(node.callee.object);
        if (rootIdentifierName) {
          const fieldVar = fieldVariables.get(rootIdentifierName);
          if (fieldVar) {
            fieldVar.hasResolverAnnotation = true;
          }
        }

        const secondArg = node.arguments[1];
        const hasCorrectParameters =
          secondArg &&
          secondArg.type === "ObjectExpression" &&
          secondArg.properties.some(
            (p) =>
              p.key.name === "parameters" &&
              p.value.type === "ObjectExpression" &&
              p.value.properties.length >= 2 && // Check for presence of keys
              p.value.properties.some(
                (subP) => subP.key.name === "appFunctionId"
              ) &&
              p.value.properties.some(
                (subP) => subP.key.name === "appDefinitionId"
              )
          );

        if (!hasCorrectParameters) {
          if (!appFunctionId || !appDefinitionId) {
            context.report({ node, messageId: "missingIdsInConfig" });
            return;
          }

          context.report({
            node,
            messageId: "missingParameters",
            fix(fixer) {
              const fixString = `,\n           {\n             parameters: {\n               appFunctionId: '${appFunctionId}',\n               appDefinitionId: '${appDefinitionId}'\n             }\n           }`;
              // If a second argument exists but is wrong, replace it. Otherwise, add it.
              if (node.arguments.length > 1) {
                return fixer.replaceText(
                  node.arguments[1],
                  fixString.substring(1)
                ); // remove leading comma
              }
              return fixer.insertTextAfter(firstArg, fixString);
            },
          });
        }
      },

      // Track variables assigned from `createField` or `editField`
      "VariableDeclarator[init.callee.property.name=/^(createField|editField)$/]"(
        node
      ) {
        if (
          node.id.type === "Identifier" &&
          node.init.arguments[0]?.type === "Literal"
        ) {
          fieldVariables.set(node.id.name, {
            node: node.init,
            fieldName: node.init.arguments[0].value,
            hasResolverAnnotation: false,
            isObjectType: false, // Initialize as false, will be updated by .type('Object') visitor
          });
        }
      },

      // Track if a field's type is set to 'Object'
      "CallExpression[callee.property.name='type']"(node) {
        const firstArg = node.arguments[0];
        if (
          firstArg &&
          firstArg.type === "Literal" &&
          firstArg.value === "Object"
        ) {
          // Use the helper to get the root identifier name for chained calls
          const rootIdentifierName = getRootIdentifierName(node.callee.object);
          if (rootIdentifierName) {
            const fieldVar = fieldVariables.get(rootIdentifierName);
            if (fieldVar) {
              fieldVar.isObjectType = true;
            }
          }
        }
      },

      // Final check at the end of file traversal
      "Program:exit"() {
        if (!appFunctionId || !appDefinitionId) {
          // If configuration is missing, we can't fix anything, so report if needed.
          // The `missingIdsInConfig` message is already handled in individual visitors.
          return;
        }

        for (const [varName, varInfo] of fieldVariables.entries()) {
          // Check if it's an Object type field and it's missing the resolver annotation
          if (varInfo.isObjectType && !varInfo.hasResolverAnnotation) {
            context.report({
              node: varInfo.node, // Report on the createField/editField node
              messageId: "missingAnnotation",
              data: { fieldName: varInfo.fieldName },
              fix(fixer) {
                const fixString = `\n    ${varName}.setAnnotations(["Contentful:GraphQLFieldResolver"], {\n      parameters: {\n        appFunctionId: '${appFunctionId}',\n        appDefinitionId: '${appDefinitionId}'\n      }\n    });`;
                // Insert the fix after the entire variable declaration line
                const statement = varInfo.node.parent;
                return fixer.insertTextAfter(statement, fixString);
              },
            });
          }
        }
      },
    };
  },
};
