import {ASTTransformer} from '../transformation-pipeline';
import {
    DocumentNode,
    FieldDefinitionNode,
    GraphQLID,
    InputObjectTypeDefinitionNode,
    InputValueDefinitionNode,
    ObjectTypeDefinitionNode,
    TypeNode
} from 'graphql';
import {
    findDirectiveWithName,
    getChildEntityTypes,
    getNamedTypeDefinitionAST,
    getRootEntityTypes,
    hasDirectiveWithName
} from '../../schema-utils';
import {
    INPUT_OBJECT_TYPE_DEFINITION,
    LIST_TYPE,
    NAMED_TYPE,
    NON_NULL_TYPE,
    OBJECT_TYPE_DEFINITION
} from '../../../graphql/kinds';
import {
    getAddChildEntitiesFieldName,
    getAddRelationFieldName,
    getCreateInputTypeName,
    getRemoveChildEntitiesFieldName,
    getRemoveRelationFieldName, getUpdateAllInputTypeName,
    getUpdateChildEntitiesFieldName,
    getUpdateInputTypeName
} from '../../../graphql/names';
import {
    CHILD_ENTITY_DIRECTIVE,
    ENTITY_CREATED_AT,
    ENTITY_UPDATED_AT,
    ID_FIELD,
    RELATION_DIRECTIVE, ROLES_DIRECTIVE
} from '../../schema-defaults';
import { compact, flatMap } from '../../../utils/utils';
import {
    buildInputFieldFromNonListField, buildInputFieldsFromCalcMutationField,
    buildInputValueListNodeFromField,
    buildInputValueNodeID
} from './add-input-type-transformation-helper-transformer';

export class AddUpdateEntityInputTypesTransformer implements ASTTransformer {

    transform(ast: DocumentNode): void {
        getRootEntityTypes(ast).forEach(objectType => {
            ast.definitions.push(this.createUpdateInputTypeForObjectType(ast, objectType));
            ast.definitions.push(this.createUpdateAllInputTypeForObjectType(ast, objectType));
        });
        getChildEntityTypes(ast).forEach(objectType => {
            ast.definitions.push(this.createUpdateInputTypeForObjectType(ast, objectType));
        })
    }

    protected createUpdateInputTypeForObjectType(ast: DocumentNode, objectType: ObjectTypeDefinitionNode): InputObjectTypeDefinitionNode {
        return {
            kind: INPUT_OBJECT_TYPE_DEFINITION,
            name: { kind: "Name", value: getUpdateInputTypeName(objectType) },
            fields: [buildInputValueNodeID(), ...this.createInputTypeFieldsForObjectType(ast, objectType)],
            loc: objectType.loc,
            directives: compact([ findDirectiveWithName(objectType, ROLES_DIRECTIVE) ])
        }
    }

    protected createUpdateAllInputTypeForObjectType(ast: DocumentNode, objectType: ObjectTypeDefinitionNode): InputObjectTypeDefinitionNode {
       return {
            kind: INPUT_OBJECT_TYPE_DEFINITION,
            name: { kind: "Name", value: getUpdateAllInputTypeName(objectType) },
            fields: this.createInputTypeFieldsForObjectType(ast, objectType),
            loc: objectType.loc,
            directives: compact([ findDirectiveWithName(objectType, ROLES_DIRECTIVE) ])
        }
    }

    protected createInputTypeFieldsForObjectType(ast: DocumentNode, objectType: ObjectTypeDefinitionNode): InputValueDefinitionNode[] {
        // create input fields for all entity fields except createdAt, updatedAt
        const skip = [ID_FIELD, ENTITY_CREATED_AT, ENTITY_UPDATED_AT];
        return flatMap(objectType.fields.filter(field => !skip.includes(field.name.value)), field => this.createInputTypeField(ast, field, field.type))
    }

    // undefined currently means not supported.
    protected createInputTypeField(ast: DocumentNode, field: FieldDefinitionNode, type: TypeNode): InputValueDefinitionNode[] {
        switch (type.kind) {
            case NON_NULL_TYPE:
                return this.createInputTypeField(ast, field, type.type);
            case NAMED_TYPE:
                return [ buildInputFieldFromNonListField(ast, field, type), ...buildInputFieldsFromCalcMutationField(ast, field, type) ];
            case LIST_TYPE:
                const effectiveType = type.type.kind === NON_NULL_TYPE ? type.type.type : type.type;
                if (effectiveType.kind === LIST_TYPE) {
                    throw new Error('Lists of lists are not allowed.');
                }
                const namedTypeOfList = getNamedTypeDefinitionAST(ast, effectiveType.name.value);
                if (namedTypeOfList.kind === OBJECT_TYPE_DEFINITION) {
                    if (hasDirectiveWithName(field, RELATION_DIRECTIVE)) {
                        // add/remove by foreign key
                        return [
                            buildInputValueListNodeFromField(getAddRelationFieldName(field.name.value), GraphQLID.name, field),
                            buildInputValueListNodeFromField(getRemoveRelationFieldName(field.name.value), GraphQLID.name, field),
                        ];
                    }
                    if (hasDirectiveWithName(namedTypeOfList, CHILD_ENTITY_DIRECTIVE)) {
                        // add / update /remove with data
                        return [
                            buildInputValueListNodeFromField(getAddChildEntitiesFieldName(field.name.value), getCreateInputTypeName(namedTypeOfList), field),
                            buildInputValueListNodeFromField(getUpdateChildEntitiesFieldName(field.name.value), getUpdateInputTypeName(namedTypeOfList), field),
                            buildInputValueListNodeFromField(getRemoveChildEntitiesFieldName(field.name.value), GraphQLID.name, field),
                        ]
                    }
                    return [buildInputValueListNodeFromField(field.name.value, getUpdateInputTypeName(namedTypeOfList), field)];
                } else {
                    return [buildInputValueListNodeFromField(field.name.value, effectiveType.name.value, field)];
                }
        }
    }

}