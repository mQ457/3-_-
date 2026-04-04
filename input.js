// Ждем загрузки DOM
document.addEventListener('DOMContentLoaded', function() {
    
    // === 1. Очистка полей при фокусе ===
    // Добавляем атрибут data-clear-on-focus="true" к полям, которые нужно очищать при клике
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
    
    // === 2. Полная очистка всех полей формы ===
    // Добавляем атрибут data-clear-all="true" к форме, которую нужно полностью очищать
    const formsToClear = document.querySelectorAll('[data-clear-all="true"]');
    formsToClear.forEach(form => {
        // Очищаем при загрузке
        clearFormFields(form);
        
        // Очищаем при обновлении страницы
        window.addEventListener('pageshow', function(event) {
            if (event.persisted) {
                clearFormFields(form);
            }
        });
    });
    
    // === 3. Очистка полей с определенным классом ===
    // Используйте класс .clear-on-load для полей, которые нужно очистить при загрузке
    const fieldsToClear = document.querySelectorAll('.clear-on-load');
    fieldsToClear.forEach(field => {
        field.value = '';
    });
    
    // === 4. Очистка полей с placeholder (без значений по умолчанию) ===
    // Используйте класс .clear-placeholder для полей с placeholder
    const placeholderFields = document.querySelectorAll('.clear-placeholder');
    placeholderFields.forEach(field => {
        field.value = '';
    });
    
    // === 5. Универсальная функция очистки формы ===
    window.clearForm = function(formId) {
        const form = document.getElementById(formId);
        if (form) {
            clearFormFields(form);
            return true;
        }
        return false;
    };
    
    // === 6. Очистка всех полей на странице ===
    window.clearAllInputs = function() {
        const allInputs = document.querySelectorAll('input, textarea');
        allInputs.forEach(input => {
            input.value = '';
        });
    };
    
    // Вспомогательная функция для очистки полей формы
    function clearFormFields(form) {
        const inputs = form.querySelectorAll('input, textarea');
        inputs.forEach(input => {
            // Если есть data-default - сбрасываем к значению по умолчанию
            if (input.hasAttribute('data-default')) {
                input.value = input.getAttribute('data-default');
            } 
            // Если есть placeholder - очищаем полностью
            else if (input.hasAttribute('placeholder')) {
                input.value = '';
            }
            // Иначе просто очищаем
            else {
                input.value = '';
            }
        });
    }
});