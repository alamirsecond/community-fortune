import Joi from 'joi';

// Validation function for inline use
export const validateSchema = (schema, data) => {
  const { error, value } = schema.validate(data, {
    abortEarly: false,
    stripUnknown: true
  });
  
  if (error) {
    const validationError = new Error('Validation error');
    validationError.details = error.details.map(detail => ({
      field: detail.path.join('.'),
      message: detail.message
    }));
    throw validationError;
  }
  
  return value;
};