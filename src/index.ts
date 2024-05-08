import {
    getNamedType,
    GraphQLEnumType,
    GraphQLError,
    GraphQLInputObjectType,
    GraphQLInterfaceType,
    GraphQLObjectType,
    GraphQLScalarType,
    GraphQLUnionType,
    isInterfaceType,
    isIntrospectionType,
    isObjectType,
    isUnionType,
    type ASTVisitor,
    type ExecutionArgs,
    type FieldNode,
    type GraphQLNamedType,
    type ObjectFieldNode,
    type ValidationContext,
} from 'graphql';
import { type ObjMap } from 'graphql/jsutils/ObjMap';
import { type GraphQLInputType } from 'graphql/type/definition';
import { isIntrospectionOperationString } from '@envelop/core';
import { useExtendedValidation } from '@envelop/extended-validation';
import { stringInterpolator } from '@graphql-mesh/string-interpolation';
import { type MeshPlugin, type MeshPluginOptions } from '@graphql-mesh/types';
import { type PublicSchemaPluginConfig, type SchemaField } from './types';

export default function usePublicSchema(
    options: MeshPluginOptions<PublicSchemaPluginConfig>,
): MeshPlugin<any> {
    const enabled =
        typeof options.enabled === 'string'
            ? stringInterpolator.parse(options.enabled, { env: process.env }) === 'true'
            : options.enabled;

    if (!enabled) {
        return {};
    }

    const privateFields: SchemaField[] = [];

    const isPrivate = (fieldName: string, typeName: string): boolean => {
        return !!privateFields.find(
            privateField =>
                privateField.fieldName === fieldName && privateField.typeName === typeName,
        );
    };

    return {
        onPluginInit({ addPlugin, setSchema }) {
            addPlugin({
                onSchemaChange({ schema }) {
                    const handlePrivate = (input: any, parentType?: string) => {
                        if (
                            input.extensions?.isPrivate ||
                            input.astNode?.directives?.find(
                                (directive: any) => directive.name.value === 'private',
                            )
                        ) {
                            privateFields.push({
                                typeName: parentType || 'undefined',
                                fieldName: input.name,
                            });
                        }
                    };

                    const types: ObjMap<GraphQLNamedType> = schema.getTypeMap();

                    for (const type of Object.values(types)) {
                        if (type.name.startsWith('__')) {
                            continue;
                        }

                        if (
                            type instanceof GraphQLScalarType ||
                            type instanceof GraphQLEnumType ||
                            type instanceof GraphQLUnionType
                        ) {
                            handlePrivate(type);
                        } else if (
                            type instanceof GraphQLInterfaceType ||
                            type instanceof GraphQLObjectType ||
                            type instanceof GraphQLInputObjectType
                        ) {
                            handlePrivate(type);

                            const fields = type.getFields();
                            for (const field of Object.values(fields)) {
                                handlePrivate(field, type.name);

                                if (field.args) {
                                    for (const arg of field.args) {
                                        handlePrivate(arg, field.name);
                                    }
                                }
                            }
                        }
                    }
                },
                onExecute({ executeFn, args, setResultAndStopExecution }) {
                    if (!isIntrospectionOperationString(args.contextValue.params.query)) {
                        return;
                    }

                    const result = executeFn(args);

                    const newResultTypes = [];

                    for (const rootType of result.data.__schema.types) {
                        const privateFieldsByType = privateFields.filter(
                            privateField => privateField.typeName === rootType.name,
                        );
                        if (privateFieldsByType.length === 0) {
                            newResultTypes.push(rootType);

                            continue;
                        }

                        const fieldFilter = (field: any) =>
                            !privateFieldsByType.find(
                                privateField => privateField.fieldName === field.name,
                            );

                        if (rootType.fields) {
                            rootType.fields = rootType.fields.filter(fieldFilter);
                        }
                        if (rootType.inputFields) {
                            rootType.inputFields = rootType.inputFields.filter(fieldFilter);
                        }
                        if (rootType.enumValues) {
                            rootType.enumValues = rootType.enumValues.filter(fieldFilter);
                        }

                        newResultTypes.push(rootType);
                    }

                    result.data.__schema.types = newResultTypes;

                    setResultAndStopExecution(result);
                },
            });
            addPlugin(
                useExtendedValidation({
                    rules: [
                        (context: ValidationContext, executionArgs: ExecutionArgs): ASTVisitor => {
                            const handleField = (
                                node: FieldNode | ObjectFieldNode,
                                objectType: GraphQLObjectType | GraphQLInputType,
                            ) => {
                                if (
                                    node?.name?.value &&
                                    // @ts-expect-error
                                    objectType?.name &&
                                    // @ts-expect-error
                                    isPrivate(node.name.value, objectType.name)
                                ) {
                                    const error = new GraphQLError(
                                        // @ts-expect-error
                                        `Cannot field "${node.name.value}" on type "${objectType.name}".`,
                                    );
                                    (error as any).nodes = [node];
                                    context.reportError(error);
                                }
                            };

                            return {
                                ObjectField(node: ObjectFieldNode) {
                                    const argument = context.getArgument();
                                    if (argument) {
                                        handleField(node, argument.type);
                                    }
                                },
                                Field(node: FieldNode) {
                                    const type = context.getType();
                                    if (type) {
                                        const namedType = getNamedType(type);
                                        if (isIntrospectionType(namedType)) {
                                            return;
                                        }
                                    }

                                    const parentType = context.getParentType();
                                    if (parentType) {
                                        if (isIntrospectionType(parentType)) {
                                            return;
                                        }
                                        if (isObjectType(parentType)) {
                                            handleField(node, parentType);
                                        }
                                        if (isUnionType(parentType)) {
                                            for (const objectType of parentType.getTypes()) {
                                                handleField(node, objectType);
                                            }
                                        }
                                        if (isInterfaceType(parentType)) {
                                            for (const objectType of executionArgs.schema.getImplementations(
                                                parentType,
                                            ).objects) {
                                                handleField(node, objectType);
                                            }
                                        }
                                    }
                                },
                            };
                        },
                    ],
                }),
            );
        },
    };
}
