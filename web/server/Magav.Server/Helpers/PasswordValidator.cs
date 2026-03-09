namespace Magav.Server.Helpers;

public static class PasswordValidator
{
    private const string SpecialCharacters = "!@#$%^&*()_+-=[]{}|;:',.<>?/";

    public static (bool IsValid, string[] Errors) Validate(string password)
    {
        var errors = new List<string>();

        if (string.IsNullOrEmpty(password) || password.Length < 8)
            errors.Add("Password must be at least 8 characters");

        if (!password.Any(char.IsUpper))
            errors.Add("Password must contain at least one uppercase letter");

        if (!password.Any(char.IsLower))
            errors.Add("Password must contain at least one lowercase letter");

        if (!password.Any(char.IsDigit))
            errors.Add("Password must contain at least one digit");

        if (!password.Any(c => SpecialCharacters.Contains(c)))
            errors.Add("Password must contain at least one special character");

        return (errors.Count == 0, errors.ToArray());
    }

    public static (bool IsValid, string[] Errors) ValidateHebrew(string password)
    {
        var errors = new List<string>();

        if (string.IsNullOrEmpty(password) || password.Length < 8)
            errors.Add("הסיסמה חייבת להכיל לפחות 8 תווים");

        if (!password.Any(char.IsUpper))
            errors.Add("הסיסמה חייבת להכיל לפחות אות גדולה אחת באנגלית");

        if (!password.Any(char.IsLower))
            errors.Add("הסיסמה חייבת להכיל לפחות אות קטנה אחת באנגלית");

        if (!password.Any(char.IsDigit))
            errors.Add("הסיסמה חייבת להכיל לפחות ספרה אחת");

        if (!password.Any(c => SpecialCharacters.Contains(c)))
            errors.Add("הסיסמה חייבת להכיל לפחות תו מיוחד אחד");

        return (errors.Count == 0, errors.ToArray());
    }
}
