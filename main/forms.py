from django import forms
from django.core.exceptions import ValidationError
from django.contrib.auth.forms import UserCreationForm, AuthenticationForm
from django.contrib.auth.models import User
from .models import Client, Inspection, InspectorMapping, FoodSafetyAgencyInspection

class ClientForm(forms.ModelForm):
    """Form for creating/editing clients"""
    name = forms.CharField(
        required=True,
        widget=forms.TextInput(attrs={
            'class': 'form-control',
            'placeholder': 'Client name'
        })
    )

    internal_account_code = forms.CharField(
        required=False,
        widget=forms.TextInput(attrs={
            'class': 'form-control',
            'placeholder': 'Internal account code (from Google Sheets Column H)'
        })
    )

    town = forms.CharField(
        required=False,
        widget=forms.TextInput(attrs={
            'class': 'form-control',
            'placeholder': 'Town/Location'
        })
    )

    corporate_group = forms.CharField(
        required=False,
        widget=forms.TextInput(attrs={
            'class': 'form-control',
            'placeholder': 'e.g., Pick n Pay - Franchise'
        })
    )

    group_type = forms.CharField(
        required=False,
        widget=forms.TextInput(attrs={
            'class': 'form-control',
            'placeholder': 'e.g., Corporate Store, Franchise Store'
        })
    )

    facility_type = forms.CharField(
        required=False,
        widget=forms.TextInput(attrs={
            'class': 'form-control',
            'placeholder': 'e.g., Retailer, Butchery, Re-Packer'
        })
    )

    class Meta:
        model = Client
        fields = ['name', 'internal_account_code', 'town', 'corporate_group', 'group_type', 'facility_type']

    def clean_name(self):
        name = self.cleaned_data.get('name')
        if not name:
            raise ValidationError("Client name is required.")
        return name

class InspectionForm(forms.ModelForm):
    """Form for creating/editing inspections"""
    
    inspection_date = forms.DateField(
        required=True,
        widget=forms.DateInput(attrs={
            'type': 'date',
            'class': 'form-control'
        })
    )
    
    direction_expiry_date = forms.DateField(
        required=False,
        widget=forms.DateInput(attrs={
            'type': 'date',
            'class': 'form-control'
        })
    )
    
    bought_sample_amount = forms.DecimalField(
        required=False,
        widget=forms.NumberInput(attrs={
            'step': '0.01',
            'class': 'form-control',
            'placeholder': '0.00'
        })
    )
    
    normal_hours = forms.DecimalField(
        required=False,
        widget=forms.NumberInput(attrs={
            'step': '0.1',
            'class': 'form-control',
            'placeholder': '0.0'
        })
    )
    
    kilometres_traveled = forms.DecimalField(
        required=False,
        widget=forms.NumberInput(attrs={
            'step': '0.1',
            'class': 'form-control',
            'placeholder': '0.0'
        })
    )
    
    comments = forms.CharField(
        required=False,
        widget=forms.Textarea(attrs={
            'class': 'form-control',
            'rows': 3,
            'placeholder': 'Additional comments or notes...'
        })
    )
    
    class Meta:
        model = Inspection
        fields = [
            'inspector', 'inspection_number', 'inspection_date', 'facility_client_name', 'town',
            'commodity', 'product_name', 'product_class', 'inspected', 'sampled',
            'normal_hours', 'kilometres_traveled', 'fat', 'protein', 'calcium', 'dna',
            'bought_sample_amount', 'lab_used', 'follow_up', 'occurrence_report',
            'dispensation_application', 'comments', 'uploaded', 'rfi_reference_number',
            'invoice_reference_number', 'lab_result_reference_number', 're_test',
            're_test_reference_number', 'verification_external_testing', 'compliance_document',
            'direction_expiry_date', 'email', 'additional_email_1', 'additional_email_2',
            'additional_email_3', 'additional_email_4', 'was_mail_sent', 'compiled_supporting_documents'
        ]
        widgets = {
            'inspector': forms.TextInput(attrs={'class': 'form-control', 'placeholder': 'Inspector name'}),
            'inspection_number': forms.NumberInput(attrs={'class': 'form-control', 'placeholder': 'Inspection number'}),
            'facility_client_name': forms.TextInput(attrs={'class': 'form-control', 'placeholder': 'Facility or client name'}),
            'town': forms.TextInput(attrs={'class': 'form-control', 'placeholder': 'Town/location'}),
            'commodity': forms.TextInput(attrs={'class': 'form-control', 'placeholder': 'e.g., RAW'}),
            'product_name': forms.TextInput(attrs={'class': 'form-control', 'placeholder': 'Product name'}),
            'product_class': forms.TextInput(attrs={'class': 'form-control', 'placeholder': 'Product class'}),
            'lab_used': forms.TextInput(attrs={'class': 'form-control', 'placeholder': 'e.g., Food Safety Laboratory'}),
            'rfi_reference_number': forms.TextInput(attrs={'class': 'form-control', 'placeholder': 'RFI reference'}),
            'invoice_reference_number': forms.TextInput(attrs={'class': 'form-control', 'placeholder': 'Invoice reference'}),
            'lab_result_reference_number': forms.TextInput(attrs={'class': 'form-control', 'placeholder': 'Lab result reference'}),
            're_test_reference_number': forms.TextInput(attrs={'class': 'form-control', 'placeholder': 'Re-test reference'}),
            'compliance_document': forms.TextInput(attrs={'class': 'form-control', 'placeholder': 'Compliance document'}),
            'email': forms.EmailInput(attrs={'class': 'form-control', 'placeholder': 'Primary email'}),
            'additional_email_1': forms.EmailInput(attrs={'class': 'form-control', 'placeholder': 'Additional email 1'}),
            'additional_email_2': forms.EmailInput(attrs={'class': 'form-control', 'placeholder': 'Additional email 2'}),
            'additional_email_3': forms.EmailInput(attrs={'class': 'form-control', 'placeholder': 'Additional email 3'}),
            'additional_email_4': forms.EmailInput(attrs={'class': 'form-control', 'placeholder': 'Additional email 4'}),
            'compiled_supporting_documents': forms.TextInput(attrs={'class': 'form-control', 'placeholder': 'Supporting documents'}),
        }

    def clean(self):
        cleaned_data = super().clean()
        
        # Ensure required fields are provided
        if not cleaned_data.get('inspector'):
            self.add_error('inspector', 'Inspector name is required.')
        if not cleaned_data.get('inspection_number'):
            self.add_error('inspection_number', 'Inspection number is required.')
        if not cleaned_data.get('inspection_date'):
            self.add_error('inspection_date', 'Inspection date is required.')
        if not cleaned_data.get('facility_client_name'):
            self.add_error('facility_client_name', 'Facility/client name is required.')
        
        # Check for duplicate inspection numbers for the same inspector
        inspector = cleaned_data.get('inspector')
        inspection_number = cleaned_data.get('inspection_number')
        
        if inspector and inspection_number:
            existing = Inspection.objects.filter(
                inspector=inspector,
                inspection_number=inspection_number
            )
            if self.instance:
                existing = existing.exclude(pk=self.instance.pk)
            
            if existing.exists():
                self.add_error('inspection_number', f'Inspection number {inspection_number} already exists for inspector {inspector}.')
        
        return cleaned_data

# User management forms

class RegisterForm(UserCreationForm):
    """Form for user registration"""
    email = forms.EmailField(
        widget=forms.EmailInput(attrs={
            'class': 'form-control',
            'autocomplete': 'off',
            'placeholder': 'Email address'
        })
    )
    username = forms.CharField(
        widget=forms.TextInput(attrs={
            'class': 'form-control',
            'autocomplete': 'off',
            'placeholder': 'Username'
        })
    )
    password1 = forms.CharField(
        label="Password",
        widget=forms.PasswordInput(attrs={
            'class': 'form-control',
            'autocomplete': 'new-password',
            'placeholder': 'Password'
        })
    )
    password2 = forms.CharField(
        label="Confirm Password",
        widget=forms.PasswordInput(attrs={
            'class': 'form-control',
            'autocomplete': 'new-password',
            'placeholder': 'Confirm password'
        })
    )

    class Meta:
        model = User
        fields = ['username', 'email', 'password1', 'password2']

class LoginForm(AuthenticationForm):
    """Form for user login"""
    username = forms.CharField(
        widget=forms.TextInput(attrs={
            'class': 'form-control',
            'autocomplete': 'off',
            'placeholder': 'Username'
        })
    )
    password = forms.CharField(
        widget=forms.PasswordInput(attrs={
            'class': 'form-control',
            'autocomplete': 'current-password',
            'placeholder': 'Password'
        })
    )


class InspectorMappingForm(forms.ModelForm):
    """Form for creating/editing inspector mappings"""
    inspector_id = forms.IntegerField(
        required=True,
        widget=forms.NumberInput(attrs={
            'class': 'form-control',
            'placeholder': 'Server inspector ID (e.g., 1234567)',
            'min': '1'
        })
    )
    
    inspector_name = forms.CharField(
        required=True,
        widget=forms.TextInput(attrs={
            'class': 'form-control',
            'placeholder': 'Inspector name (e.g., Ethan)'
        })
    )
    
    class Meta:
        model = InspectorMapping
        fields = ['inspector_id', 'inspector_name', 'is_active']
        widgets = {
            'is_active': forms.CheckboxInput(attrs={'class': 'form-check-input'})
        }
    
    def clean_inspector_id(self):
        inspector_id = self.cleaned_data.get('inspector_id')
        if inspector_id:
            # Check if this ID already exists (excluding current instance if editing)
            existing = InspectorMapping.objects.filter(inspector_id=inspector_id)
            if self.instance:
                existing = existing.exclude(pk=self.instance.pk)
            
            if existing.exists():
                raise ValidationError(f"Inspector ID {inspector_id} is already assigned to another inspector.")
        
        return inspector_id
    
    def clean_inspector_name(self):
        inspector_name = self.cleaned_data.get('inspector_name')
        if not inspector_name:
            raise ValidationError("Inspector name is required.")
        return inspector_name


class FoodSafetyAgencyInspectionForm(forms.ModelForm):
    """Form for manually creating/editing Food Safety Agency Inspections"""

    COMMODITY_CHOICES = [
        ('', '-- Select Commodity --'),
        ('POULTRY', 'Poultry'),
        ('RAW', 'Raw'),
        ('PMP', 'PMP'),
        ('EGGS', 'Eggs'),
    ]

    LAB_CHOICES = [
        ('', '-- Select Lab --'),
        ('lab_b', 'Merieux NutriSciences'),
        ('lab_c', 'AGRI Food Laboratory (SGS)'),
        ('lab_d', 'SANBI'),
        ('lab_e', 'SMT'),
        ('lab_f', 'ARC'),
        ('lab_a', 'Food Safety Laboratory'),
        ('lab_g', 'Food Consulting Services (FCS)'),
        ('lab_h', 'AssureCloud/NOSA'),
    ]

    PRODUCT_CLASS_CHOICES = [
        ('', '-- Select Product Class --'),
        ('Raw species sausage / wors', 'Raw species sausage / wors'),
        ('Extra Lean Mince', 'Extra Lean Mince'),
        ('Lean Mince', 'Lean Mince'),
        ('Regular Mince', 'Regular Mince'),
        ('Raw Flavoured Ground Meat', 'Raw Flavoured Ground Meat'),
        ('Raw Flavoured Ground Meat & Offal', 'Raw Flavoured Ground Meat & Offal'),
        ('Raw Flavoured mixed species Ground Meat', 'Raw Flavoured mixed species Ground Meat'),
        ('Raw Flavoured mixed species Ground Meat & Offal', 'Raw Flavoured mixed species Ground Meat & Offal'),
        ('Raw Boerewors', 'Raw Boerewors'),
        ('Raw mixed species sausage / wors', 'Raw mixed species sausage / wors'),
        ('Ground Burger / Ground patty = Extra Lean', 'Ground Burger / Ground patty = Extra Lean'),
        ('Ground Burger / Ground patty = Lean', 'Ground Burger / Ground patty = Lean'),
        ('Ground Burger / Ground patty = Regular', 'Ground Burger / Ground patty = Regular'),
        ('Burger / Patty / Hamburger Patty / Meatball / Frikkadel = Extra Lean', 'Burger / Patty / Hamburger Patty / Meatball / Frikkadel = Extra Lean'),
        ('Burger / Patty / Hamburger Patty / Meatball / Frikkadel = Lean', 'Burger / Patty / Hamburger Patty / Meatball / Frikkadel = Lean'),
        ('Burger / Patty / Hamburger Patty / Meatball / Frikkadel = Regular', 'Burger / Patty / Hamburger Patty / Meatball / Frikkadel = Regular'),
        ('Value burger / Value patty / Value hamburger / Value meatball / Value frikkadel', 'Value burger / Value patty / Value hamburger / Value meatball / Value frikkadel'),
        ('Economy Burger / Econo Burger / Economy Patty / Econo Patty / Budget Burger', 'Economy Burger / Econo Burger / Economy Patty / Econo Patty / Budget Burger'),
        ('Raw Banger / Griller', 'Raw Banger / Griller'),
        ('Raw Bratwurst / Sizzler', 'Raw Bratwurst / Sizzler'),
        ('Whole Muscle, uncured and heat / partial heat treated products', 'Whole Muscle, uncured and heat / partial heat treated products'),
        ('Whole muscle, uncured, no or partial heat treated and air dried products', 'Whole muscle, uncured, no or partial heat treated and air dried products'),
        ('Whole muscle, uncured, no or partial heat treated and air dried products undergoing a lengthy maturation period (minimum 21 days)', 'Whole muscle, uncured, no or partial heat treated and air dried products undergoing a lengthy maturation period (minimum 21 days)'),
        ('Whole muscle, dry cured, no or partial heat treated products', 'Whole muscle, dry cured, no or partial heat treated products'),
        ('Whole muscle, cured and no or partial heat treated products', 'Whole muscle, cured and no or partial heat treated products'),
        ('Whole muscle, cured, no or partial heat treated and air dried products', 'Whole muscle, cured, no or partial heat treated and air dried products'),
        ('Whole muscle, dry cured, no or partial heat treated and dried products', 'Whole muscle, dry cured, no or partial heat treated and dried products'),
        ('Comminuted, cured and heat treated products', 'Comminuted, cured and heat treated products'),
        ('Comminuted, uncured, no or partial heat treated and dried products', 'Comminuted, uncured, no or partial heat treated and dried products'),
        ('Comminuted, cured, no or partial heat treated, dried and fermented products', 'Comminuted, cured, no or partial heat treated, dried and fermented products'),
        ('Comminuted, uncured and heat treated products', 'Comminuted, uncured and heat treated products'),
        ('Reformed, uncured and no or partial heat treated products', 'Reformed, uncured and no or partial heat treated products'),
        ('Reformed, cured, heat treated products from single species', 'Reformed, cured, heat treated products from single species'),
        ('Reformed, cured, heat treated products from mixed species', 'Reformed, cured, heat treated products from mixed species'),
        ('Reformed, cured and no or partial heat treated products', 'Reformed, cured and no or partial heat treated products'),
        ('Liver spreads, pâté and terrines', 'Liver spreads, pâté and terrines'),
        ('Products in aspic: Brawn', 'Products in aspic: Brawn'),
        ('Product in aspic: Souse, Other products containing cured meat pieces in aspic', 'Product in aspic: Souse, Other products containing cured meat pieces in aspic'),
        ('Products made from blood', 'Products made from blood'),
        ('Coated Processed Meat Products', 'Coated Processed Meat Products'),
        ('Unspecified processed meat products', 'Unspecified processed meat products'),
    ]

    commodity = forms.ChoiceField(
        choices=COMMODITY_CHOICES,
        required=False,  # Validated in clean() - not required for occurrence reports
        widget=forms.Select(attrs={
            'class': 'form-control',
        })
    )

    date_of_inspection = forms.DateField(
        required=True,
        widget=forms.DateInput(attrs={
            'type': 'date',
            'class': 'form-control'
        })
    )

    client_name = forms.CharField(
        required=True,
        widget=forms.TextInput(attrs={
            'class': 'form-control',
            'placeholder': 'Client name'
        })
    )

    internal_account_code = forms.CharField(
        required=False,
        widget=forms.TextInput(attrs={
            'class': 'form-control',
            'placeholder': 'Internal account code (e.g., RE-IND-EGG-NA-5042)'
        })
    )

    inspector_name = forms.CharField(
        required=True,
        widget=forms.TextInput(attrs={
            'class': 'form-control',
            'placeholder': 'Inspector name'
        })
    )

    town = forms.CharField(
        required=False,
        widget=forms.TextInput(attrs={
            'class': 'form-control',
            'placeholder': 'Town/location'
        })
    )

    product_name = forms.CharField(
        required=False,
        widget=forms.TextInput(attrs={
            'class': 'form-control',
            'placeholder': 'Product name (e.g., Mince, Eggs)'
        })
    )

    product_class = forms.ChoiceField(
        choices=PRODUCT_CLASS_CHOICES,
        required=False,
        widget=forms.Select(attrs={
            'class': 'form-control',
        })
    )

    inspected = forms.BooleanField(
        required=False,
        widget=forms.CheckboxInput(attrs={'class': 'form-check-input'})
    )

    is_sample_taken = forms.BooleanField(
        required=False,
        widget=forms.CheckboxInput(attrs={'class': 'form-check-input'})
    )

    bought_sample = forms.DecimalField(
        required=False,
        widget=forms.NumberInput(attrs={
            'step': '0.01',
            'class': 'form-control',
            'placeholder': '0.00'
        })
    )

    km_traveled = forms.DecimalField(
        required=False,
        widget=forms.NumberInput(attrs={
            'step': '0.1',
            'class': 'form-control',
            'placeholder': 'Kilometers traveled'
        })
    )

    hours = forms.DecimalField(
        required=False,
        widget=forms.NumberInput(attrs={
            'step': '0.1',
            'class': 'form-control',
            'placeholder': 'Hours worked'
        })
    )

    lab = forms.ChoiceField(
        choices=LAB_CHOICES,
        required=False,
        widget=forms.Select(attrs={
            'class': 'form-control',
        })
    )

    follow_up = forms.BooleanField(
        required=False,
        widget=forms.CheckboxInput(attrs={'class': 'form-check-input'})
    )

    occurrence_report = forms.BooleanField(
        required=False,
        widget=forms.CheckboxInput(attrs={'class': 'form-check-input'})
    )

    dispensation_application = forms.BooleanField(
        required=False,
        widget=forms.CheckboxInput(attrs={'class': 'form-check-input'})
    )

    comment = forms.CharField(
        required=False,
        widget=forms.Textarea(attrs={
            'class': 'form-control',
            'rows': 3,
            'placeholder': 'Additional comments...'
        })
    )

    # Override additional_email to accept comma-separated emails
    additional_email = forms.CharField(
        required=False,
        max_length=500,
        widget=forms.TextInput(attrs={
            'class': 'form-control',
            'placeholder': 'client@example.com'
        }),
        help_text="Can contain multiple emails separated by commas"
    )

    corporate_group = forms.CharField(
        required=False,
        max_length=200,
        widget=forms.TextInput(attrs={
            'class': 'form-control'
        })
    )

    group_type = forms.CharField(
        required=False,
        max_length=100,
        widget=forms.TextInput(attrs={
            'class': 'form-control'
        })
    )

    facility_type = forms.CharField(
        required=False,
        max_length=100,
        widget=forms.TextInput(attrs={
            'class': 'form-control'
        })
    )

    class Meta:
        model = FoodSafetyAgencyInspection
        fields = [
            'commodity', 'date_of_inspection', 'client_name', 'internal_account_code',
            'inspector_name', 'town', 'product_name', 'product_class',
            'inspected', 'is_sample_taken', 'bought_sample', 'km_traveled', 'hours',
            'lab', 'fat', 'protein', 'calcium', 'dna', 'needs_retest',
            'follow_up', 'occurrence_report', 'dispensation_application', 'comment',
            'additional_email', 'corporate_group', 'group_type', 'facility_type'
        ]
        widgets = {
            'inspected': forms.CheckboxInput(attrs={'class': 'form-check-input'}),
            'fat': forms.CheckboxInput(attrs={'class': 'form-check-input'}),
            'protein': forms.CheckboxInput(attrs={'class': 'form-check-input'}),
            'calcium': forms.CheckboxInput(attrs={'class': 'form-check-input'}),
            'dna': forms.CheckboxInput(attrs={'class': 'form-check-input'}),
            'follow_up': forms.CheckboxInput(attrs={'class': 'form-check-input'}),
            'occurrence_report': forms.CheckboxInput(attrs={'class': 'form-check-input'}),
            'dispensation_application': forms.CheckboxInput(attrs={'class': 'form-check-input'}),
            'needs_retest': forms.Select(attrs={'class': 'form-control'}, choices=[
                ('', '-- Select --'),
                ('YES', 'Yes'),
                ('NO', 'No'),
            ]),
        }

    def clean(self):
        cleaned_data = super().clean()

        # Skip commodity validation for occurrence reports
        is_occurrence = getattr(self.instance, 'is_occurrence_report', False)

        # Ensure required fields are provided (except commodity for occurrence reports)
        if not is_occurrence and not cleaned_data.get('commodity'):
            self.add_error('commodity', 'Commodity is required.')
        if not cleaned_data.get('date_of_inspection'):
            self.add_error('date_of_inspection', 'Date of inspection is required.')
        if not cleaned_data.get('client_name'):
            self.add_error('client_name', 'Client name is required.')
        if not cleaned_data.get('inspector_name'):
            self.add_error('inspector_name', 'Inspector name is required.')

        return cleaned_data