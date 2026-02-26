// Codemod to transform Promise .then()/.catch() chains into async/await syntax
//
// Usage:
//   npx jscodeshift -t codemods/promise-to-async-await.cjs src/ --extensions=js,ts --parser=ts
//
// What this codemod does:
// 1. Transforms .then() chains into sequential await statements
// 2. Transforms .catch() handlers into try/catch blocks
// 3. Wraps containing functions with async keyword if needed
// 4. Handles nested .then() chains inside callback bodies
// 5. Handles await X.then().catch() patterns
//
// Limitations:
// - May require manual review for complex conditional logic
// - Cypress test files should be excluded (they use chainable syntax)

module.exports = function (fileInfo, api) {
  const j = api.jscodeshift;
  const root = j(fileInfo.source);

  // Track which functions need to be made async
  const functionsToMakeAsync = new Set();

  // Track already processed nodes to avoid infinite loops
  const processedNodes = new WeakSet();

  // Check if a node is a Promise chain (.then or .catch call)
  function isPromiseChain(node) {
    return (
      node &&
      node.type === "CallExpression" &&
      node.callee &&
      node.callee.type === "MemberExpression" &&
      node.callee.property &&
      (node.callee.property.name === "then" ||
        node.callee.property.name === "catch")
    );
  }

  // Check if a node is a .then() call
  function isThenCall(node) {
    return (
      node &&
      node.type === "CallExpression" &&
      node.callee &&
      node.callee.type === "MemberExpression" &&
      node.callee.property &&
      node.callee.property.name === "then"
    );
  }

  // Check if a node is a .catch() call
  function isCatchCall(node) {
    return (
      node &&
      node.type === "CallExpression" &&
      node.callee &&
      node.callee.type === "MemberExpression" &&
      node.callee.property &&
      node.callee.property.name === "catch"
    );
  }

  // Collect all .then() and .catch() handlers in order
  function collectChainHandlers(node, handlers) {
    handlers = handlers || [];
    if (!isPromiseChain(node)) {
      return { base: node, handlers: handlers };
    }

    var result = collectChainHandlers(node.callee.object, handlers);

    if (isThenCall(node)) {
      result.handlers.push({
        type: "then",
        callback: node.arguments[0],
        rejectCallback: node.arguments[1],
      });
    } else if (isCatchCall(node)) {
      result.handlers.push({
        type: "catch",
        callback: node.arguments[0],
      });
    }

    return result;
  }

  // Extract parameter name from callback function
  function getCallbackParamName(callback) {
    if (!callback) return null;
    if (
      callback.type === "ArrowFunctionExpression" ||
      callback.type === "FunctionExpression"
    ) {
      if (callback.params && callback.params.length > 0) {
        var param = callback.params[0];
        if (param.type === "Identifier") {
          return param.name;
        }
        return param;
      }
    }
    return null;
  }

  // Recursively transform any promise chains in an array of statements
  function transformStatementsRecursively(statements) {
    var result = [];
    for (var i = 0; i < statements.length; i++) {
      var stmt = statements[i];
      var transformed = transformStatementIfNeeded(stmt);
      if (Array.isArray(transformed)) {
        result = result.concat(transformed);
      } else {
        result.push(transformed);
      }
    }
    return result;
  }

  // Transform a single statement if it contains a promise chain
  function transformStatementIfNeeded(stmt) {
    if (!stmt) return stmt;

    if (
      stmt.type === "ExpressionStatement" &&
      isPromiseChain(stmt.expression)
    ) {
      if (processedNodes.has(stmt.expression)) {
        return stmt;
      }
      processedNodes.add(stmt.expression);
      return transformPromiseChainToStatements(stmt.expression, null, null);
    }

    // Handle if statements - transform promise chains in consequent/alternate
    if (stmt.type === "IfStatement") {
      if (stmt.consequent) {
        if (stmt.consequent.type === "BlockStatement") {
          stmt.consequent.body = transformStatementsRecursively(
            stmt.consequent.body,
          );
        } else {
          let transformed = transformStatementIfNeeded(stmt.consequent);
          if (Array.isArray(transformed)) {
            stmt.consequent = j.blockStatement(transformed);
          } else {
            stmt.consequent = transformed;
          }
        }
      }
      if (stmt.alternate) {
        if (stmt.alternate.type === "BlockStatement") {
          stmt.alternate.body = transformStatementsRecursively(
            stmt.alternate.body,
          );
        } else if (stmt.alternate.type === "IfStatement") {
          stmt.alternate = transformStatementIfNeeded(stmt.alternate);
        } else {
          let transformed = transformStatementIfNeeded(stmt.alternate);
          if (Array.isArray(transformed)) {
            stmt.alternate = j.blockStatement(transformed);
          } else {
            stmt.alternate = transformed;
          }
        }
      }
    }

    return stmt;
  }

  // Get callback body statements and recursively transform nested promise chains
  function getCallbackBodyStatements(callback) {
    if (!callback) return [];

    if (
      callback.type === "ArrowFunctionExpression" ||
      callback.type === "FunctionExpression"
    ) {
      // Mark this callback as needing to be async if it contains promise chains
      if (callback.body.type === "BlockStatement") {
        var statements = callback.body.body.slice();
        // Recursively transform any nested promise chains
        return transformStatementsRecursively(statements);
      } else {
        // Arrow function with expression body
        return [j.returnStatement(callback.body)];
      }
    }

    return [j.expressionStatement(j.callExpression(callback, []))];
  }

  // Transform a promise chain into async/await statements
  function transformPromiseChainToStatements(node, path, assignTo) {
    var chainInfo = collectChainHandlers(node);
    var base = chainInfo.base;
    var handlers = chainInfo.handlers.slice();

    if (handlers.length === 0) {
      return null;
    }

    var statements = [];

    var baseAwait;
    if (base.type === "AwaitExpression") {
      baseAwait = base;
    } else {
      baseAwait = j.awaitExpression(base);
    }

    var currentAwaitExpr = baseAwait;
    var hasCatch = false;
    var catchHandler = null;

    var lastHandler = handlers[handlers.length - 1];
    if (lastHandler && lastHandler.type === "catch") {
      hasCatch = true;
      catchHandler = lastHandler;
      handlers.pop();
    }

    for (var i = 0; i < handlers.length; i++) {
      var handler = handlers[i];

      if (handler.type === "then") {
        var callback = handler.callback;
        var paramName = getCallbackParamName(callback);

        if (callback) {
          if (
            callback.type === "ArrowFunctionExpression" ||
            callback.type === "FunctionExpression"
          ) {
            if (paramName) {
              var paramNode =
                typeof paramName === "string"
                  ? j.identifier(paramName)
                  : paramName;
              statements.push(
                j.variableDeclaration("const", [
                  j.variableDeclarator(paramNode, currentAwaitExpr),
                ]),
              );
            } else {
              statements.push(j.expressionStatement(currentAwaitExpr));
            }

            var bodyStatements = getCallbackBodyStatements(callback);
            var nextValue = null;

            for (var k = 0; k < bodyStatements.length; k++) {
              var stmt = bodyStatements[k];
              if (stmt.type === "ReturnStatement" && stmt.argument) {
                nextValue = stmt.argument;
              } else {
                statements.push(stmt);
              }
            }

            if (nextValue && i < handlers.length - 1) {
              currentAwaitExpr = j.awaitExpression(nextValue);
            } else if (nextValue) {
              if (assignTo) {
                statements.push(
                  j.expressionStatement(
                    j.assignmentExpression("=", assignTo, nextValue),
                  ),
                );
              } else {
                statements.push(j.returnStatement(nextValue));
              }
            }
          } else {
            if (i === 0) {
              statements.push(
                j.expressionStatement(
                  j.awaitExpression(j.callExpression(callback, [baseAwait])),
                ),
              );
            } else {
              statements.push(
                j.expressionStatement(
                  j.awaitExpression(j.callExpression(callback, [])),
                ),
              );
            }
          }
        } else {
          statements.push(j.expressionStatement(currentAwaitExpr));
        }

        if (handler.rejectCallback) {
          hasCatch = true;
          catchHandler = { callback: handler.rejectCallback };
        }
      }
    }

    if (statements.length === 0) {
      if (assignTo) {
        statements.push(
          j.expressionStatement(
            j.assignmentExpression("=", assignTo, currentAwaitExpr),
          ),
        );
      } else {
        statements.push(j.expressionStatement(currentAwaitExpr));
      }
    }

    if (hasCatch && catchHandler && catchHandler.callback) {
      var catchParamNameResult = getCallbackParamName(catchHandler.callback);
      var catchParamName = catchParamNameResult || "err";
      var catchParamNode =
        typeof catchParamName === "string"
          ? j.identifier(catchParamName)
          : catchParamName;

      var catchBodyStatements = getCallbackBodyStatements(
        catchHandler.callback,
      );

      if (assignTo) {
        catchBodyStatements = catchBodyStatements.map(function (stmt) {
          if (stmt.type === "ReturnStatement" && stmt.argument) {
            return j.expressionStatement(
              j.assignmentExpression("=", assignTo, stmt.argument),
            );
          }
          return stmt;
        });
      }

      var tryStatement = j.tryStatement(
        j.blockStatement(statements),
        j.catchClause(
          catchParamNode,
          null,
          j.blockStatement(catchBodyStatements),
        ),
      );

      return [tryStatement];
    }

    return statements;
  }

  // Find the containing function and mark it as needing async
  function markContainingFunctionAsync(path) {
    var current = path;
    while (current) {
      var node = current.node;
      if (
        node.type === "FunctionDeclaration" ||
        node.type === "FunctionExpression" ||
        node.type === "ArrowFunctionExpression" ||
        node.type === "ObjectMethod" ||
        node.type === "ClassMethod"
      ) {
        functionsToMakeAsync.add(node);
        return node;
      }
      current = current.parent;
    }
    return null;
  }

  // Handle assignment expressions where RHS is await + promise chain
  root.find(j.AssignmentExpression).forEach(function (path) {
    var right = path.node.right;

    if (
      right &&
      right.type === "AwaitExpression" &&
      isPromiseChain(right.argument)
    ) {
      if (processedNodes.has(right.argument)) return;
      processedNodes.add(right.argument);

      var assignTo = path.node.left;
      var transformed = transformPromiseChainToStatements(
        right.argument,
        path,
        assignTo,
      );

      if (transformed && transformed.length > 0) {
        markContainingFunctionAsync(path);

        var parentPath = path.parent;
        if (parentPath && parentPath.node.type === "ExpressionStatement") {
          j(parentPath).replaceWith(transformed);
        }
      }
    }
  });

  // Handle variable declarations where init is await + promise chain
  root.find(j.VariableDeclarator).forEach(function (path) {
    var init = path.node.init;

    if (
      init &&
      init.type === "AwaitExpression" &&
      isPromiseChain(init.argument)
    ) {
      if (processedNodes.has(init.argument)) return;
      processedNodes.add(init.argument);

      var varName = path.node.id;
      var transformed = transformPromiseChainToStatements(
        init.argument,
        path,
        varName,
      );

      if (transformed && transformed.length > 0) {
        markContainingFunctionAsync(path);

        var parentPath = path.parent;
        if (parentPath && parentPath.node.type === "VariableDeclaration") {
          if (parentPath.node.declarations.length === 1) {
            var letDecl = j.variableDeclaration("let", [
              j.variableDeclarator(varName, null),
            ]);
            j(parentPath).replaceWith([letDecl].concat(transformed));
          }
        }
      }
    }
  });

  // Find and transform promise chains that are expression statements
  root.find(j.ExpressionStatement).forEach(function (path) {
    var expr = path.node.expression;

    if (isPromiseChain(expr)) {
      if (processedNodes.has(expr)) return;
      processedNodes.add(expr);

      var transformed = transformPromiseChainToStatements(expr, path, null);

      if (transformed && transformed.length > 0) {
        markContainingFunctionAsync(path);
        j(path).replaceWith(transformed);
      }
    }
  });

  // Handle remaining promise chains in variable declarations (without await)
  root.find(j.VariableDeclaration).forEach(function (path) {
    path.node.declarations.forEach(function (declarator) {
      if (declarator.init && isPromiseChain(declarator.init)) {
        if (processedNodes.has(declarator.init)) return;
        processedNodes.add(declarator.init);

        var chainInfo = collectChainHandlers(declarator.init);
        var base = chainInfo.base;
        var handlers = chainInfo.handlers;

        if (handlers.length > 0) {
          markContainingFunctionAsync(path);

          if (base.type !== "AwaitExpression") {
            declarator.init = j.awaitExpression(base);
          } else {
            declarator.init = base;
          }
        }
      }
    });
  });

  // Make marked functions async
  functionsToMakeAsync.forEach(function (funcNode) {
    if (!funcNode.async) {
      funcNode.async = true;
    }
  });

  return root.toSource({ quote: "double" });
};

module.exports.parser = "ts";
