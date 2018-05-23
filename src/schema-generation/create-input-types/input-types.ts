import { Thunk } from 'graphql';
import { flatMap, fromPairs, toPairs } from 'lodash';
import { Field } from '../../model/implementation';
import { ENTITY_CREATED_AT, ENTITY_UPDATED_AT, ID_FIELD } from '../../schema/schema-defaults';
import { PlainObject } from '../../utils/utils';
import { TypedInputObjectType } from '../typed-input-object-type';
import { CreateInputField } from './input-fields';
import uuid = require('uuid');

function getCurrentISODate() {
    return new Date().toISOString();
}

export class CreateObjectInputType extends TypedInputObjectType<CreateInputField> {
    constructor(
        name: string,
        fields: Thunk<ReadonlyArray<CreateInputField>>
    ) {
        super(name, fields);
    }

    prepareValue(value: PlainObject): PlainObject {
        const applicableFields = this.getApplicableInputFields(value);
        const properties = [
            ...flatMap(applicableFields, field => toPairs(field.getProperties(value[field.name]))),
            ...toPairs(this.getAdditionalProperties(value))
        ];
        return fromPairs(properties);
    }

    protected getAdditionalProperties(value: PlainObject): PlainObject {
        return {};
    }

    collectAffectedFields(value: PlainObject, fields: Set<Field>) {
        this.getApplicableInputFields(value).forEach(field => field.collectAffectedFields(value[field.name], fields));
    }

    getAffectedFields(value: PlainObject): ReadonlyArray<Field> {
        const fields = new Set<Field>();
        this.collectAffectedFields(value, fields);
        return Array.from(fields);
    }

    private getApplicableInputFields(value: PlainObject): ReadonlyArray<CreateInputField> {
        return this.fields.filter(field => field.name in value || field.appliesToMissingFields());
    }
}

export class CreateRootEntityInputType extends CreateObjectInputType {
    getAdditionalProperties() {
        const now = getCurrentISODate();
        return {
            [ENTITY_CREATED_AT]: now,
            [ENTITY_UPDATED_AT]: now
        };
    }

    // getRelationAddRemoveStatements() // TODO
}

export class CreateChildEntityInputType extends CreateObjectInputType {
    getAdditionalProperties() {
        const now = getCurrentISODate();
        return {
            [ID_FIELD]: uuid(),
            [ENTITY_CREATED_AT]: now,
            [ENTITY_UPDATED_AT]: now
        };
    }
}
