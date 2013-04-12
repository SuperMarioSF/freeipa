/*  Authors:
 *    Pavel Zuna <pzuna@redhat.com>
 *    Endi Sukma Dewata <edewata@redhat.com>
 *    Adam Young <ayoung@redhat.com>
 *    Petr Vobornik <pvoborni@redhat.com>
 *
 * Copyright (C) 2010-2011 Red Hat
 * see file 'COPYING' for use and warranty information
 *
 * This program is free software; you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <http://www.gnu.org/licenses/>.
 */

define(['./ipa', './jquery', './text', './facets', './facet'],
       function(IPA, $, text, facet_reg) {

IPA.entity = function(spec) {

    spec = spec || {};

    spec.policies = spec.policies || [
        IPA.search_facet_update_policy(),
        IPA.details_facet_update_policy()
    ];

    var that = IPA.object();

    that.name = spec.name;
    that.label = text.get(spec.label);

    that.defines_key = spec.defines_key !== undefined ? spec.defines_key : true;

    that.metadata = spec.metadata;

    that.dialogs = $.ordered_map();
    that.dialog_specs = spec.dialogs || [];
    that.dialogs_created = false;

    that.policies = IPA.entity_policies({
        entity: that,
        policies: spec.policies
    });

    that.facets = $.ordered_map();
    that.facet_groups = $.ordered_map();
    that.facet_specs = spec.facets || [];
    that.facets_created = false;

    // current facet
    that.facet = null;

    that.redirect_facet = spec.redirect_facet;
    that.containing_entity = null;

    that.init = function() {
        if (!that.metadata) {
            that.metadata = that.get_default_metadata();
            if (!that.metadata) {
                throw {
                    expected: true,
                    message: "Entity " + that.name + " not supported by server."
                };
            }
        }
        that.label = text.get(that.label) || that.metadata.label || that.name;
    };

    that.get_default_metadata = function() {
        return IPA.metadata.objects[that.name];
    };

    that.get_containing_entity = function() {
        return that.containing_entity;
    };

    that.get_dialog = function(name) {

        //build all dialogs on the first time
        if(!that.dialogs_created) {
            var builder = IPA.dialog_builder(that);
            builder.build_dialogs();
            that.dialogs_created = true;
        }

        return that.dialogs.get(name);
    };

    that.add_dialog = function(dialog) {
        return that.dialog(dialog);
    };

    that.dialog = function(dialog) {
        dialog.entity = that;
        that.dialogs.put(dialog.name, dialog);
        return that;
    };

    that.add_facet_group = function(facet_group) {
        that.facet_groups.put(facet_group.name, facet_group);
    };

    that.get_facet_group = function(name) {
        return that.facet_groups.get(name);
    };

    that.remove_facet_groups = function() {
        that.facet_groups.empty();
    };

    that.add_redirect_info = function(facet_name) {
        if (!that.redirect_facet && facet_name){
             that.redirect_facet = facet_name;
        }
    };

    that.get_facet = function(name) {

        var i, facets;

        //build all facets on the first time
        if(!that.facets_created) {
            facets = facet_reg.builder.build(that.facet_specs, { entity: that });
            for (i=0; i<facets.length; i++) {
                var facet = facets[i];
                that.add_facet(facet);
                if (facet.name === 'search') {
                    that.add_redirect_info(facet.name);
                }
            }
            that.facets_created = true;
            that.policies.facets_created();
        }

        if (name === undefined) {
            // return the current facet
            if (that.facet) return that.facet;

            // return the main facet
            return that.facets.values[0];

        } else if (name === 'default') {
            // return the first facet in the first facet group
            var facet_groups = that.facet_groups.values;
            for (i=0; i<facet_groups.length; i++) {
                var facet_group = facet_groups[i];
                facets = facet_group.facets.values;
                if (!facets.length) continue;
                return facets[0];
            }

            return that.facets.values[0];
        }

        return that.facets.get(name);
    };

    that.add_facet = function(facet) {
        facet.entity = that;

        that.facets.put(facet.name, facet);

        if (facet.facet_group) {
            var facet_group = that.get_facet_group(facet.facet_group);
            if (facet_group) {
                facet_group.add_facet(facet);
            }
        }

        return that;
    };

    that.builder = spec.builder || IPA.entity_builder(that);

    that.entity_init = that.init;

    return that;
};

IPA.entity_builder = function(entity) {

    var that = IPA.object();

    var facet_group = null;
    var facet = null;
    var section = null;

    that.facet_group = function(spec) {
        spec.entity = entity;
        if (spec instanceof Object) {
            var factory = spec.$factory || IPA.facet_group;
            facet_group = factory(spec);
        } else {
            facet_group = IPA.facet_group({ name: spec });
        }

        if (facet_group.label == undefined) {
            facet_group.label = text.get('@i18n:facet_groups.'+facet_group.name);
        }

        entity.add_facet_group(facet_group);

        return that;
    };

    that.facet_groups = function(specs) {

        entity.remove_facet_groups();

        for (var i=0; i<specs.length; i++) {
            specs[i].entity = entity;
            that.facet_group(specs[i]);
        }

        return that;
    };

    that.facet = function(spec) {

        entity.facet_specs.push(spec);

        return that;
    };

    that.search_facet = function(spec) {

        spec.$type = spec.$type || 'search';

        that.facet(spec);

        add_redirect_info(spec.name);

        return that;
    };

    that.nested_search_facet = function(spec) {

        spec.$type = spec.$type || 'nested_search';

        that.facet(spec);

        return that;
    };

    that.details_facet = function(spec) {

        spec.$type = spec.$type || 'details';

        that.facet(spec);

        return that;
    };

    that.association_facet = function(spec) {

        spec.$type = spec.$type || 'association';

        that.facet(spec);

        return that;
    };

    that.attribute_facet = function(spec) {

        spec.$type = spec.$type || 'attribute';

        that.facet(spec);

        return that;
    };

    that.standard_association_facets = function(spec) {

        spec = spec || {};
        spec.entity = entity;

        var direct_associations = [];
        var indirect_associations = [];

        for (var association in entity.metadata.attribute_members) {
            if (association == 'memberindirect' ||
                association == 'memberofindirect') {
                indirect_associations.push(association);
            } else {
                direct_associations.push(association);
            }
        }

        // make sure direct facets are created first
        var attribute_members = direct_associations.concat(indirect_associations);

        for (var i=0; i<attribute_members.length; i++) {
            var attribute_member = attribute_members[i];
            var other_entities = entity.metadata.attribute_members[attribute_member];

            for (var j=0; j<other_entities.length; j++) {

                var other_entity = other_entities[j];
                var association_name = attribute_member+'_'+other_entity;

                //already prepared facet
                var facet = get_spec_by_name(entity.facet_specs, association_name);
                //already prepared direct facet for indirect facet
                var direct_facet = get_direct_facet(entity.facet_specs,
                                                    attribute_member,
                                                    other_entity);
                if (facet || direct_facet) {
                    continue; //in both cases don't prepare new facet
                }

                var tmp_spec = $.extend({}, spec);
                tmp_spec.name = association_name;

                that.association_facet(tmp_spec);
            }
        }

        return that;
    };

    function get_spec_by_name(specs, name) {
        if(!specs || !specs.length) return null;

        for(var i=0; i<specs.length; i++) {
            if(specs[i].name === name) {
                return specs[i];
            }
        }

        return null;
    }

    /*
     * If it's an indirect attribute member, return its direct facets spec
     * if it exists.
     */
    function get_direct_facet(facets, attribute_member, other_entity) {

        var index = attribute_member.indexOf('indirect');
        if(index > -1) {
            var direct_attribute_member = attribute_member.substring(0, index);
            return get_spec_by_name(facets,
                                    direct_attribute_member+'_'+other_entity);
        }

        return null;
    }

    function add_redirect_info(facet_name){
        facet_name = facet_name || 'search';
        if (!entity.redirect_facet){
            entity.redirect_facet = facet_name;
        }
    }

    that.containing_entity = function(entity_name) {
        add_redirect_info();
        entity.containing_entity = IPA.get_entity(entity_name);
        return that;
    };

    that.dialog = function(spec) {

        if (spec instanceof Object) {
            spec.$factory = spec.$factory || IPA.dialog;
            spec.entity = entity;

        } else {
            spec = {
                $factory: IPA.dialog,
                name: spec,
                entity: entity
            };
        }

        entity.dialog_specs.push(spec);
        return that;
    };

    that.adder_dialog = function(spec) {
        spec.$factory = spec.$factory || IPA.entity_adder_dialog;
        spec.name = spec.name || 'add';

        if (!spec.title) {
            var title = text.get('@i18n:dialogs.add_title');
            var label = entity.metadata.label_singular;
            spec.title = title.replace('${entity}', label);
        }

        return that.dialog(spec);
    };

    that.deleter_dialog = function(spec) {
        spec.$factory = spec.$factory || IPA.search_deleter_dialog;
        spec.name = spec.name || 'remove';

        return that.dialog(spec);
    };

    that.facet_groups([
        'member',
        'settings',
        'memberof',
        'managedby'
    ]);



    return that;
};

IPA.dialog_builder = function(entity) {

    var that = IPA.object();

    that.build_dialogs = function() {

        if(entity.dialog_specs && entity.dialog_specs.length) {
            var dialogs = entity.dialog_specs;
            for(var i=0; i<dialogs.length; i++) {
                that.build_dialog(dialogs[i]);
            }
        }
    };

    that.build_dialog = function(spec) {
        //do common logic
        spec.entity = entity;

        //add dialog
        var dialog = spec.$factory(spec);
        entity.dialog(dialog);
    };

    return that;
};

IPA.entity_policy = function(spec) {

    spec = spec || {};

    var that = IPA.object();

    that.entity = spec.entity;

    that.facets_created = function() {
    };

    return that;
};

IPA.entity_policies = function(spec) {

    var that = IPA.object();

    that.entity = spec.entity;
    that.policies = [];

    that.add_policy = function(policy) {

        policy.entity = that.entity;
        that.policies.push(policy);
    };

    that.add_policies = function(policies) {

        if (!policies) return;

        for (var i=0; i<policies.length; i++) {
            that.add_policy(policies[i]);
        }
    };

    that.facets_created = function() {

        for (var i=0; i<that.policies.length; i++) {
            that.policies[i].facets_created();
        }
    };

    that.add_policies(spec.policies);

    return that;
};

IPA.facet_update_policy = function(spec) {

    spec = spec || {};

    var that = IPA.entity_policy();

    that.event = spec.event || 'on_update';
    that.source_facet_name = spec.source_facet;
    that.dest_facet_name = spec.dest_facet;
    that.dest_entity_name = spec.dest_entity;

    that.facets_created = function() {

        that.source_facet = that.entity.get_facet(that.source_facet_name);
        var dest_entity = that.entity;
        if (that.dest_entity_name) {
            dest_entity = IPA.get_entity(that.dest_entity_name);
            if (!dest_entity) return;
        }
        that.dest_facet = dest_entity.get_facet(that.dest_facet_name);

        if (!that.source_facet || !that.dest_facet) return;

        var event = that.source_facet[that.event];
        if (!event && !event.attach) return;

        event.attach(that.set_expired_flag);
    };

    that.set_expired_flag = function() {

        that.dest_facet.set_expired_flag();
    };

    return that;
};

IPA.adder_facet_update_policy = function(spec) {

    spec = spec || {};

    var that = IPA.entity_policy();

    that.event = spec.event || 'added';
    that.dialog_name = spec.dialog_name || 'add';
    that.dest_facet_name = spec.dest_facet || 'details';
    that.dest_entity_name = spec.dest_entity;

    that.facets_created = function() {

        that.dialog = that.entity.get_dialog(that.dialog_name);
        var dest_entity = that.entity;
        if (that.dest_entity_name) {
            dest_entity = IPA.get_entity(that.dest_entity_name);
            if (!dest_entity) return;
        }
        that.dest_facet = dest_entity.get_facet(that.dest_facet_name);

        if (!that.dialog || !that.dest_facet) return;

        var event = that.dialog[that.event];
        if (!event && !event.attach) return;

        event.attach(that.set_expired_flag);
    };

    that.set_expired_flag = function() {

        that.dest_facet.set_expired_flag();
    };

    return that;
};

IPA.search_facet_update_policy = function(spec) {

    spec = spec || {};
    spec.source_facet = 'search';
    spec.dest_facet = 'details';

    return IPA.facet_update_policy(spec);
};

IPA.details_facet_update_policy = function(spec) {

    spec = spec || {};
    spec.source_facet = 'details';
    spec.dest_facet = 'search';

    return IPA.facet_update_policy(spec);
};

return {};
});