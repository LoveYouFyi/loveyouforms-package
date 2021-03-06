/*------------------------------------------------------------------------------
  Form Data and Sheet Header Rows
------------------------------------------------------------------------------*/

/*-- Dependencies ------------------------------------------------------------*/
const { dateTime, queryDoc, sortObjectsAsc, objectValuesByKey } =
  require('./../utility');

/*------------------------------------------------------------------------------
 Form Data Row Sorted:
 Sort and merge data row to be sent to sheets
 Return nested array of strings [ [ 'John Smith', 'etc' ] ]
------------------------------------------------------------------------------*/
const getFormDataRowSorted = (app, formTemplate, createdDateTime,
  templateData) => {
  // Fields Ids Sorted: required for sorting templateData so data row that is sent
  // to sheets will be sorted in the same order as the sheet's column header
  const formTemplateFieldsIdsSorted = objectValuesByKey(
    sortObjectsAsc(formTemplate.fields, "position"), "id");

  // Date and time when form submission was saved to the database
  const dateTimeFormSubmitted = dateTime(createdDateTime, app);

  // Template Data Sorted: returns an object that contains the new
  // formSubmit record's data sort-ordered to match formTemplate fields positions
  const templateDataSorted =
    formTemplateFieldsIdsSorted.reduce((a, fieldName) => {
    // if fieldName data not exist set empty string since config sort order requires it
    templateData[fieldName]
      ? a[fieldName] = templateData[fieldName]
      : a[fieldName] = "";
    return a;
  }, {});

  // Merge objects in sort-order and return only values
  // Sheets requires a nested array of strings [ [ 'John Smith', 'etc' ] ]
  // Fyi Object.values returns an array
  return [
    Object.values({
      date: dateTimeFormSubmitted.date,
      time: dateTimeFormSubmitted.time,
      ...templateDataSorted
    })
  ];
}

/*------------------------------------------------------------------------------
 Sheet Header Row Sorted: required for spreadsheet column headers when
 adding a new sheet to a spreadsheet
 Sheets requires a nested array of strings [ [ 'Date', 'Time', etc ] ]
------------------------------------------------------------------------------*/
const getSheetHeaderRowSorted = formTemplate => {

  const sheetHeaderSorted = objectValuesByKey(
      sortObjectsAsc(formTemplate.fields, "position"), "sheetHeader");

  return [[
      'Date',
      'Time',
      ...sheetHeaderSorted
  ]];
}

/*------------------------------------------------------------------------------
  Form Data and Sheet Header Rows:
  Form Data Row as {}
  Sheet Header Row as []
------------------------------------------------------------------------------*/
module.exports = async (snapshot, app) => {

  // Form Results
  const { createdDateTime, template: { data: { ...templateData },
    name: templateName  } } = snapshot.data();

  // Form Template: to sort by order of 'fields' 'position'
  const formTemplate = await queryDoc('formTemplate', templateName);

  // Form Data Row Sorted
  const formDataRowSorted = getFormDataRowSorted(app, formTemplate,
    createdDateTime, templateData);

  // Sheet Header Row Sorted
  const sheetHeaderRowSorted = getSheetHeaderRowSorted(formTemplate);

  //////////////////////////////////////////////////////////////////////////////
  // Return object
  //////////////////////////////////////////////////////////////////////////////
  return ({
    formDataRowSorted,
    sheetHeaderRowSorted
  });

}
