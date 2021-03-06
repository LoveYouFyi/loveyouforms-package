/*------------------------------------------------------------------------------
  Form Results
  Returns form submission results as props on object structured to match
  'trigger email' extension requirements
------------------------------------------------------------------------------*/

/*-- Dependencies ------------------------------------------------------------*/
const { admin, queryDoc, queryDocWhere, objectValuesByKey }
  = require('./../utility');
const getSpamCheck = require('./spam-check');

/*------------------------------------------------------------------------------
  Props All:
  Compile 1) form-submission fields, and 2) relevant database fields into object
------------------------------------------------------------------------------*/
const getPropsAll = async (formSubmission, app) => {
  // Form Field Defaults: select all default fields from database
  const formFieldDefaults =
    await queryDocWhere('formField', 'default', '==', true);

  // Return object containing default fields as props
  const propsFormFieldDefaults = formFieldDefaults.docs.reduce((a, doc) => {
    a[doc.id] = doc.data().value;
    return a;
  }, {});

  // Consolidate fields as props, last-in overwrite previous
  return {
    appKey: app.id, ...propsFormFieldDefaults, ...formSubmission, ...app.appInfo
  }
};

/*------------------------------------------------------------------------------
  Form Template: Data and Fields IDs
  Whitelist of Fields IDs used to identify props to add to database at
  submitForm/.../template.data used by 'trigger email' extensiona
------------------------------------------------------------------------------*/
const getFormTemplate = async (templateName) => {

  const data = await queryDoc('formTemplate', templateName);

  const fieldsIds = objectValuesByKey(data.fields, 'id');

  return {
    data,
    fieldsIds
  }
}

/*------------------------------------------------------------------------------
  Props Allowed:
  Excludes fields not used for database or code actions to prevent database
  errors due to querying docs using disallowed values
  e.g. if html <input> had name="__anything__"
  See doc limits: https://firebase.google.com/docs/firestore/quotas#limits
------------------------------------------------------------------------------*/
const getPropsAllowed = async (app, propsAll, formTemplate) => {
  // Form Fields Required: fields required for cloud function to work
  // Return Array of field names
  const formFieldsRequired =
    await queryDocWhere('formField', 'required', '==', true);

  const formFieldsRequiredIds = formFieldsRequired.docs.reduce((a, doc) => {
    a.push(doc.id);
    return a;
  }, []);

  // Props Keys Whitelist:
  // Array for database & code actions last-in overwrites previous
  const propKeysWhitelist = [
    ...formFieldsRequiredIds,
    ...formTemplate.fieldsIds,
    ...Object.keys(app.appInfo)
  ];

  // Props Allowed Entries:
  // Return Object entries used for database or code actions
  const allowedEntries = Object.entries(propsAll).reduce(
    (a, [key, value]) => {
      if (propKeysWhitelist.includes(key)) {
        a[key] = value;
      }
      return a;
    }, {});

  return allowedEntries;
}

/*------------------------------------------------------------------------------
  Props Set & Get:
------------------------------------------------------------------------------*/
const props = (() => {

  const trim = value => value.toString().trim();
  const props =  { toUids: '', templateData: {} }

  // compare database fields with form-submitted props and build object
  const setProps = (formTemplateFieldsIds, propsToParse) =>
    Object.entries(propsToParse).forEach(([key, value]) => {
      value = trim(value);
      props[key] = value;
      // toUids: appKey value unless if spam true to prevent sending email
      if (key === 'appKey') {
        props.toUids = value;
      } else if (key === 'spam') {
        // if spam then override toUids value so email is not sent
        (value === 'true') && (props.toUids = "SPAM_SUSPECTED_DO_NOT_EMAIL");
      }
      // Form Template Fields: Whitelist check
      if (formTemplateFieldsIds.includes(key)) {
        props.templateData[key] = value;
      }
    });

  const getProps =
    ({ templateData, urlRedirect = false, ...key } = props) => ({
      data: {
        appKey: key.appKey,
        createdDateTime: admin.firestore.FieldValue.serverTimestamp(),
        from: key.appFrom,
        ...key.spam && { spam: key.spam },
        toUids: [ key.toUids ],
        replyTo: templateData.email,
        template: {
          name: key.templateName,
          data: templateData
        }
      },
      urlRedirect: urlRedirect
    });

  return {
    set: (formTemplateFieldsIds, props) => {
      setProps(formTemplateFieldsIds, props);
    },
    get: () => {
      return getProps();
    }
  };
})();

/*------------------------------------------------------------------------------
  Form Results:
  Returns form submission results as props on object structured to match
  'trigger email' extension requirements
------------------------------------------------------------------------------*/
module.exports = async (req, formSubmission, app, globalApp) => {
  // Aggregate info used for setting props
  const propsAll = await getPropsAll(formSubmission, app);
  const formTemplate = await getFormTemplate(propsAll.templateName);

  //////////////////////////////////////////////////////////////////////////////
  // Set props allowed
  //////////////////////////////////////////////////////////////////////////////
  const propsAllowed = await getPropsAllowed(app, propsAll, formTemplate);
  props.set(formTemplate.fieldsIds, propsAllowed);

  //////////////////////////////////////////////////////////////////////////////
  // Set props spam check result boolean
  //////////////////////////////////////////////////////////////////////////////
  const spamCheck =
    await getSpamCheck(req, app, globalApp, formTemplate.data, props.get().data)

  props.set(formTemplate.fieldsIds, spamCheck);

  //////////////////////////////////////////////////////////////////////////////
  // Return props
  //////////////////////////////////////////////////////////////////////////////
  return props.get();

}
