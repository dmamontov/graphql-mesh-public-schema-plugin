# Public Schema Plugin for GraphQL Mesh

Public Schema Plugin is a plugin for GraphQL Mesh that allows you to separate public and private schemas in your API. With this plugin, you can designate which parts of your schema should be accessible only within your service and which can be exposed to external service.

## Installation

Before you can use the Public Schema Plugin, you need to install it along with GraphQL Mesh if you haven't already done so. You can install these using npm or yarn.

```bash
npm install @dmamontov/graphql-mesh-public-schema-plugin
```

or

```bash
yarn add @dmamontov/graphql-mesh-public-schema-plugin
```

## Configuration

### Modifying tsconfig.json

To make TypeScript recognize the Public Schema Plugin, you need to add an alias in your tsconfig.json.

Add the following paths configuration under the compilerOptions in your tsconfig.json file:

```json
{
  "compilerOptions": {
    "paths": {
       "public-schema": ["node_modules/@dmamontov/graphql-mesh-public-schema-plugin"]
    }
  }
}
```

### Adding the Plugin to GraphQL Mesh

You need to include the Public Schema Plugin in your GraphQL Mesh configuration file (usually .meshrc.yaml). Below is an example configuration that demonstrates how to use this plugin:

```yaml
additionalTypeDefs:
  - node_modules/@dmamontov/graphql-mesh-public-schema-plugin/esm/private-directive.graphql
  
plugins:
  - publicSchema:
      enabled: true
```

## Conclusion

Remember, always test your configurations in a development environment before applying them in production to ensure that everything works as expected.