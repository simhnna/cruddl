import { ObjectTypeBase } from './object-type-base';
import { ChildEntityTypeConfig, FieldConfig, TypeKind } from '../config';
import { Model } from './model';

export class ChildEntityType extends ObjectTypeBase {
    constructor(input: ChildEntityTypeConfig, model: Model) {
        super(input, model, systemFieldInputs);
    }

    readonly kind: TypeKind.CHILD_ENTITY = TypeKind.CHILD_ENTITY;
    readonly isChildEntityType: true = true;
    readonly isRootEntityType: false = false;
    readonly isEntityExtensionType: false = false;
    readonly isValueObjectType: false = false;
}

const systemFieldInputs: FieldConfig[] = [
    {
        name: 'id',
        typeName: 'ID',
        description: 'An auto-generated string that identifies this child entity uniquely within this collection of child entities'
    }, {
        name: 'createdAt',
        typeName: 'DateTime',
        description: 'The instant this object has been created'
    }, {
        name: 'updatedAt',
        typeName: 'DateTime',
        description: 'The instant this object has been updated the last time'
    }
];
