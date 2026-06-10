
document.addEventListener('DOMContentLoaded', function() {
    

    const clearOnFocusFields = document.querySelectorAll('[data-clear-on-focus="true"]');
    clearOnFocusFields.forEach(field => {
        const defaultValue = field.value;
        
        field.addEventListener('focus', function() {
            if (this.value === defaultValue) {
                this.value = '';
            }
        });
        
        field.addEventListener('blur', function() {
            if (this.value === '') {
                this.value = defaultValue;
            }
        });
    });
    

    const formsToClear = document.querySelectorAll('[data-clear-all="true"]');
    formsToClear.forEach(form => {

        clearFormFields(form);
        

        window.addEventListener('pageshow', function(event) {
            if (event.persisted) {
                clearFormFields(form);
            }
        });
    });
    

    const fieldsToClear = document.querySelectorAll('.clear-on-load');
    fieldsToClear.forEach(field => {
        field.value = '';
    });
    

    const placeholderFields = document.querySelectorAll('.clear-placeholder');
    placeholderFields.forEach(field => {
        field.value = '';
    });
    

    window.clearForm = function(formId) {
        const form = document.getElementById(formId);
        if (form) {
            clearFormFields(form);
            return true;
        }
        return false;
    };
    

    window.clearAllInputs = function() {
        const allInputs = document.querySelectorAll('input, textarea');
        allInputs.forEach(input => {
            input.value = '';
        });
    };
    

    function clearFormFields(form) {
        const inputs = form.querySelectorAll('input, textarea');
        inputs.forEach(input => {

            if (input.hasAttribute('data-default')) {
                input.value = input.getAttribute('data-default');
            } 

            else if (input.hasAttribute('placeholder')) {
                input.value = '';
            }

            else {
                input.value = '';
            }
        });
    }
});